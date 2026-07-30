#!/bin/bash
# Phase 7 Verification Script

BASE="http://localhost:3001/api"
COOKIE_JAR_OWNER="/tmp/sa_owner_cookies.txt"

echo "=== Phase 7 Verification ==="
echo ""

# 1. Clean DB first
node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  await prisma.postLog.deleteMany();
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

# 2. Register Owner + Create Workspace
echo "--- 2. Setup Owner and Workspace ---"
REGISTER_RESP=$(curl -s -c "$COOKIE_JAR_OWNER" -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@agency.com","password":"password123","name":"Agency Owner","orgName":"Creative Agency"}')
ORG_ID=$(echo "$REGISTER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['organization']['id'])" 2>/dev/null)
WS_RESP=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/workspaces" \
  -H "Content-Type: application/json" \
  -d "{\"organizationId\":\"$ORG_ID\",\"brandName\":\"Nike Running\",\"website\":\"https://nike.com\",\"cta\":\"Shop Air Max\",\"defaultHashtags\":[\"#nike\",\"#justdoit\"],\"brandVoice\":\"Energetic and inspiring\",\"emojiStyle\":\"many\"}")
WORKSPACE_ID=$(echo "$WS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['workspace']['id'])" 2>/dev/null)
echo "ORG_ID=$ORG_ID"
echo "WORKSPACE_ID=$WORKSPACE_ID"

# Connect Mock Social Accounts
curl -s -L -b "$COOKIE_JAR_OWNER" "$BASE/oauth/linkedin/connect?workspaceId=$WORKSPACE_ID" > /dev/null
curl -s -L -b "$COOKIE_JAR_OWNER" "$BASE/oauth/pinterest/connect?workspaceId=$WORKSPACE_ID" > /dev/null
curl -s -L -b "$COOKIE_JAR_OWNER" "$BASE/oauth/youtube/connect?workspaceId=$WORKSPACE_ID" > /dev/null
echo "Mock social accounts connected."
echo ""

# 3. Ingest IMAGE and VIDEO media
echo "--- 3. Uploading IMAGE & VIDEO media ---"
DUMMY_IMAGE="/tmp/test-image.jpg"
echo "fake image content" > "$DUMMY_IMAGE"
DUMMY_VIDEO="/tmp/test-video.mp4"
echo "fake video content" > "$DUMMY_VIDEO"

UPLOAD_IMG=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/workspaces/$WORKSPACE_ID/media" -F "file=@$DUMMY_IMAGE")
IMAGE_MEDIA_ID=$(echo "$UPLOAD_IMG" | python3 -c "import sys,json; print(json.load(sys.stdin)['media']['id'])" 2>/dev/null)

UPLOAD_VID=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/workspaces/$WORKSPACE_ID/media" -F "file=@$DUMMY_VIDEO")
VIDEO_MEDIA_ID=$(echo "$UPLOAD_VID" | python3 -c "import sys,json; print(json.load(sys.stdin)['media']['id'])" 2>/dev/null)

# Await analysis
for i in {1..10}; do
  MEDIA_CHECK=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID/media")
  STATUS_IMG=$(echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(next(m for m in json.load(sys.stdin)['media'] if m['id']=='$IMAGE_MEDIA_ID')['status'])" 2>/dev/null)
  STATUS_VID=$(echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(next(m for m in json.load(sys.stdin)['media'] if m['id']=='$VIDEO_MEDIA_ID')['status'])" 2>/dev/null)
  if [ "$STATUS_IMG" = "ANALYZED" ] && [ "$STATUS_VID" = "ANALYZED" ]; then
    echo "IMAGE and VIDEO both ANALYZED."
    break
  fi
  sleep 1.5
done
echo ""

# 4. Case A: Successful publishing loop on LinkedIn
echo "--- 4. Case A: Successful LinkedIn Publish ---"
SCHEDULED_TIME=$(date -u -d "1 second ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-1s +"%Y-%m-%dT%H:%M:%SZ")
POST_LI=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/workspaces/$WORKSPACE_ID/scheduled-posts" \
  -H "Content-Type: application/json" \
  -d "{\"mediaId\":\"$IMAGE_MEDIA_ID\",\"platform\":\"LINKEDIN\",\"scheduledFor\":\"$SCHEDULED_TIME\"}")
POST_ID_LI=$(echo "$POST_LI" | python3 -c "import sys,json; print(json.load(sys.stdin)['post']['id'])" 2>/dev/null)
echo "Scheduled LinkedIn Post: $POST_ID_LI"

# Trigger publish worker
node -r dotenv/config -e "
const { processDuePosts } = require('./src/services/scheduler');
async function main() {
  await processDuePosts();
  process.exit(0);
}
main();
" 2>/dev/null

# Verify status & logs
node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  const post = await prisma.scheduledPost.findUnique({
    where: { id: '$POST_ID_LI' },
    include: { postLogs: true }
  });
  console.log('Post Status:', post.status);
  console.log('External ID:', post.externalPostId);
  console.log('Logs:');
  console.log(post.postLogs.map(l => \`  [\${l.event}]: \${l.message}\`).join('\n'));
  
  if (post.status === 'PUBLISHED' && post.postLogs.some(l => l.event === 'SUCCESS')) {
    console.log('✅ PASS: Case A LinkedIn publish loop verified!');
  } else {
    console.error('❌ FAIL: Case A LinkedIn publish failed.');
  }
  await prisma.\$disconnect();
  process.exit(0);
}
main();
" 2>/dev/null
echo ""

# 5. Case B: Fast-fail rejection of YouTube Image post
echo "--- 5. Case B: YouTube Image Rejection ---"
# Note: we bypass the template validation endpoint throw by using direct DB insert (simulating a bypass of the preview layer)
POST_ID_YT=$(node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  const sa = await prisma.socialAccount.findFirst({
    where: { workspaceId: '$WORKSPACE_ID', platform: 'YOUTUBE' }
  });
  const post = await prisma.scheduledPost.create({
    data: {
      workspaceId: '$WORKSPACE_ID',
      mediaId: '$IMAGE_MEDIA_ID', // IMAGE!
      socialAccountId: sa.id,
      platform: 'YOUTUBE',
      renderedContent: { body: 'YouTube draft' },
      scheduledFor: new Date(Date.now() - 1000), // due
      status: 'PENDING'
    }
  });
  console.log(post.id);
  await prisma.\$disconnect();
  process.exit(0);
}
main();
" 2>/dev/null)
echo "Created bypassed YouTube post: $POST_ID_YT"

# Trigger publish worker
node -r dotenv/config -e "
const { processDuePosts } = require('./src/services/scheduler');
async function main() {
  await processDuePosts();
  process.exit(0);
}
main();
" 2>/dev/null

# Verify status & logs (should log failure + schedule retry)
node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  const post = await prisma.scheduledPost.findUnique({
    where: { id: '$POST_ID_YT' },
    include: { postLogs: true }
  });
  console.log('Post Status:', post.status);
  console.log('Retry Count:', post.retryCount);
  console.log('Logs:');
  console.log(post.postLogs.map(l => \`  [\${l.event}]: \${l.message}\`).join('\n'));
  
  if (post.postLogs.some(l => l.event === 'FAILURE' && l.message.includes('YouTube requires video assets'))) {
    console.log('✅ PASS: Case B fast-fail YouTube image rejected!');
  } else {
    console.error('❌ FAIL: Case B failed.');
  }
  await prisma.\$disconnect();
  process.exit(0);
}
main();
" 2>/dev/null
echo ""

# 6. Case C: Proactive token refresh and revocation recovery loop on Pinterest
echo "--- 6. Case C: Token Revocation Recovery on Pinterest ---"
POST_ID_PIN=$(node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  const sa = await prisma.socialAccount.findFirst({
    where: { workspaceId: '$WORKSPACE_ID', platform: 'PINTEREST' }
  });
  const post = await prisma.scheduledPost.create({
    data: {
      workspaceId: '$WORKSPACE_ID',
      mediaId: '$IMAGE_MEDIA_ID',
      socialAccountId: sa.id,
      platform: 'PINTEREST',
      renderedContent: { body: 'Pinterest Pin' },
      scheduledFor: new Date(Date.now() - 1000), // due
      status: 'PENDING'
    }
  });
  console.log(post.id);
  await prisma.\$disconnect();
  process.exit(0);
}
main();
" 2>/dev/null)
echo "Created Pinterest post: $POST_ID_PIN"

# Force token refresh failure by updating Pinterest refresh token to mock_revoked_token
node -r dotenv/config -e "
const prisma = require('./src/prisma');
const { encrypt } = require('./src/utils/crypto');
async function main() {
  const sa = await prisma.socialAccount.findFirst({
    where: { workspaceId: '$WORKSPACE_ID', platform: 'PINTEREST' }
  });
  await prisma.socialAccount.update({
    where: { id: sa.id },
    data: {
      refreshTokenEncrypted: encrypt('mock_revoked_token'),
      expiresAt: new Date(Date.now() - 10 * 60 * 1000) // expired
    }
  });
  console.log('Pinterest credentials updated to: mock_revoked_token');
  await prisma.\$disconnect();
  process.exit(0);
}
main();
" 2>/dev/null

# Trigger publish worker
node -r dotenv/config -e "
const { processDuePosts } = require('./src/services/scheduler');
async function main() {
  await processDuePosts();
  process.exit(0);
}
main();
" 2>/dev/null

# Verify post logs and Pinterest SocialAccount status
node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  const post = await prisma.scheduledPost.findUnique({
    where: { id: '$POST_ID_PIN' },
    include: { postLogs: true }
  });
  const sa = await prisma.socialAccount.findFirst({
    where: { workspaceId: '$WORKSPACE_ID', platform: 'PINTEREST' }
  });
  
  console.log('Post Status:', post.status);
  console.log('Social Account Status:', sa.status);
  console.log('Logs:');
  console.log(post.postLogs.map(l => \`  [\${l.event}]: \${l.message}\`).join('\n'));
  
  if (sa.status === 'EXPIRED' && post.postLogs.some(l => l.event === 'FAILURE' && l.message.includes('authorization revoked'))) {
    console.log('✅ PASS: Case C token revocation and EXPIRED status transition verified!');
  } else {
    console.error('❌ FAIL: Case C validation failed.');
  }
  await prisma.\$disconnect();
  process.exit(0);
}
main();
" 2>/dev/null
echo ""

echo "=== Phase 7 Verification Complete ==="

# Cleanup temp files
rm -f "$DUMMY_IMAGE" "$DUMMY_VIDEO" "$COOKIE_JAR_OWNER"
