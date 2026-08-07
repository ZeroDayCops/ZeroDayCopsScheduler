#!/bin/bash
# Phase 6 Verification Script

BASE="http://localhost:3001/api"
COOKIE_JAR_OWNER="/tmp/sa_owner_cookies.txt"

echo "=== Phase 6 Verification ==="
echo ""

# 1. Clean DB first
node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  await prisma.scheduledPost.deleteMany();
  await prisma.template.deleteMany({ where: { NOT: { id: { startsWith: 'default-' } } } });
  await prisma.media.deleteMany();
  await prisma.workspaceAccess.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  console.log('Database cleaned');
  await prisma.\$disconnect();
  process.exit(0);
}
main();
" 2>/dev/null

# 2. Register Owner
echo "--- 2. Register OWNER ---"
REGISTER_RESP=$(curl -s -c "$COOKIE_JAR_OWNER" -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@agency.com","password":"password123","name":"Agency Owner","orgName":"Creative Agency"}')
ORG_ID=$(echo "$REGISTER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['organization']['id'])" 2>/dev/null)
echo "ORG_ID=$ORG_ID"
echo ""

# 3. Create Workspace
echo "--- 3. Create Workspace ---"
WS_RESP=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/workspaces" \
  -H "Content-Type: application/json" \
  -d "{\"organizationId\":\"$ORG_ID\",\"brandName\":\"Nike Running\",\"website\":\"https://nike.com\",\"cta\":\"Shop Air Max\",\"defaultHashtags\":[\"#nike\",\"#justdoit\"],\"brandVoice\":\"Energetic and inspiring\",\"emojiStyle\":\"many\"}")
WORKSPACE_ID=$(echo "$WS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['workspace']['id'])" 2>/dev/null)
echo "WORKSPACE_ID=$WORKSPACE_ID"
echo ""

# 4. Trigger connect redirect callbacks (using curl -L to follow redirects)
echo "--- 4. Connecting LinkedIn (Mock Loop) ---"
LINKEDIN_RES=$(curl -s -L -b "$COOKIE_JAR_OWNER" "$BASE/oauth/linkedin/connect?workspaceId=$WORKSPACE_ID")
if [[ "$LINKEDIN_RES" == *"Linked in Account"* || "$LINKEDIN_RES" == *"Connection Successful!"* ]]; then
  echo "✅ PASS: LinkedIn connected successfully!"
else
  echo "❌ FAIL: LinkedIn connection loop failed: $LINKEDIN_RES"
fi

echo "--- Connecting Pinterest (Mock Loop) ---"
PINTEREST_RES=$(curl -s -L -b "$COOKIE_JAR_OWNER" "$BASE/oauth/pinterest/connect?workspaceId=$WORKSPACE_ID")
if [[ "$PINTEREST_RES" == *"Pinterest Account"* || "$PINTEREST_RES" == *"Connection Successful!"* ]]; then
  echo "✅ PASS: Pinterest connected successfully!"
else
  echo "❌ FAIL: Pinterest connection loop failed."
fi

echo "--- Connecting YouTube (Mock Loop) ---"
YOUTUBE_RES=$(curl -s -L -b "$COOKIE_JAR_OWNER" "$BASE/oauth/youtube/connect?workspaceId=$WORKSPACE_ID")
if [[ "$YOUTUBE_RES" == *"Youtube Account"* || "$YOUTUBE_RES" == *"Connection Successful!"* ]]; then
  echo "✅ PASS: YouTube connected successfully!"
else
  echo "❌ FAIL: YouTube connection loop failed."
fi
echo ""

# 5. Verify database columns are encrypted and status is CONNECTED
echo "--- 5. Verifying DB Encryption ---"
node -r dotenv/config -e "
const prisma = require('./src/prisma');
const { decrypt } = require('./src/utils/crypto');
async function main() {
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId: '$WORKSPACE_ID' }
  });
  console.log('Found accounts:', accounts.map(a => ({ platform: a.platform, status: a.status })));
  
  for (const a of accounts) {
    if (a.status !== 'CONNECTED') {
      console.error('❌ FAIL: Account', a.platform, 'is not CONNECTED (status:', a.status, ')');
      continue;
    }
    
    // Attempt decryption to verify it is stored encrypted
    const accessDecrypted = decrypt(a.accessTokenEncrypted);
    const refreshDecrypted = decrypt(a.refreshTokenEncrypted);
    console.log(a.platform, 'Access Token decrypted:', accessDecrypted.startsWith('mock_') ? 'OK' : 'FAIL');
    console.log(a.platform, 'Refresh Token decrypted:', refreshDecrypted.startsWith('mock_') ? 'OK' : 'FAIL');
    
    if (a.accessTokenEncrypted.startsWith('mock_') || a.refreshTokenEncrypted.startsWith('mock_')) {
      console.error('❌ FAIL: Raw unencrypted values found in database columns!');
    } else {
      console.log('✅ PASS: Tokens are stored encrypted at rest.');
    }
  }
  await prisma.\$disconnect();
  process.exit(0);
}
main().catch(console.error);
"
echo ""

# 6. Test token refresh (expired token)
echo "--- 6. Test Proactive Token Refresh (Expired Token) ---"
node -r dotenv/config -e "
const prisma = require('./src/prisma');
const { refreshTokenIfNeeded } = require('./src/services/oauth-refresh');
const { decrypt } = require('./src/utils/crypto');

async function main() {
  // Find LinkedIn account
  const account = await prisma.socialAccount.findFirst({
    where: { workspaceId: '$WORKSPACE_ID', platform: 'LINKEDIN' }
  });
  
  const oldAccessToken = decrypt(account.accessTokenEncrypted);
  console.log('Old Access Token:', oldAccessToken);
  
  // Expiry manually set to 10 minutes ago
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      expiresAt: new Date(Date.now() - 10 * 60 * 1000)
    }
  });
  
  // Trigger proactive refresh
  const refreshed = await refreshTokenIfNeeded(account.id);
  const newAccessToken = decrypt(refreshed.accessTokenEncrypted);
  console.log('New Access Token:', newAccessToken);
  console.log('New Expiry Date:', refreshed.expiresAt);
  
  if (oldAccessToken !== newAccessToken && refreshed.expiresAt > new Date()) {
    console.log('✅ PASS: Token successfully refreshed and extended!');
  } else {
    console.error('❌ FAIL: Token was not refreshed.');
  }
  
  await prisma.\$disconnect();
  process.exit(0);
}
main().catch(console.error);
"
echo ""

# 7. Test token refresh failure (revoked refresh token)
echo "--- 7. Test Refresh Failure (Revoked Refresh Token) ---"
node -r dotenv/config -e "
const prisma = require('./src/prisma');
const { refreshTokenIfNeeded } = require('./src/services/oauth-refresh');
const { encrypt } = require('./src/utils/crypto');

async function main() {
  // Find LinkedIn account
  const account = await prisma.socialAccount.findFirst({
    where: { workspaceId: '$WORKSPACE_ID', platform: 'LINKEDIN' }
  });
  
  // Manually update refresh token column to simulated revoked value
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      refreshTokenEncrypted: encrypt('mock_revoked_token'),
      expiresAt: new Date(Date.now() - 10 * 60 * 1000) // expired
    }
  });
  
  try {
    await refreshTokenIfNeeded(account.id);
    console.error('❌ FAIL: Refresh did not throw an error on revoked token!');
  } catch (err) {
    console.log('✅ PASS: Refresh correctly threw error on revoked token:', err.message);
    
    // Check if status is now EXPIRED and tokens are cleared
    const updated = await prisma.socialAccount.findUnique({
      where: { id: account.id }
    });
    console.log('Updated account status:', updated.status);
    if (updated.status === 'EXPIRED' && !updated.accessTokenEncrypted) {
      console.log('✅ PASS: Account status set to EXPIRED and tokens cleared.');
    } else {
      console.error('❌ FAIL: Columns not cleared or status mismatch:', updated);
    }
  }
  
  await prisma.\$disconnect();
  process.exit(0);
}
main().catch(console.error);
"
echo ""

echo "=== Phase 6 Verification Complete ==="

# Cleanup temp files
rm -f "$COOKIE_JAR_OWNER"
