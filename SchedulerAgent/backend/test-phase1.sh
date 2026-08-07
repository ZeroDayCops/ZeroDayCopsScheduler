#!/bin/bash
# Phase 1 Verification Script
# Tests: register, login, /me, workspace access (403 + granted)

BASE="http://localhost:3001/api"
COOKIE_JAR_OWNER="/tmp/sa_owner_cookies.txt"
COOKIE_JAR_MEMBER="/tmp/sa_member_cookies.txt"

echo "=== Phase 1 Verification ==="
echo ""

# Clean DB first
node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
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

# 1. Register org + owner
echo "--- 1. Register org + OWNER ---"
REGISTER_RESP=$(curl -s -c "$COOKIE_JAR_OWNER" -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@test.com","password":"test1234","name":"Owner User","orgName":"Test Agency"}')
echo "$REGISTER_RESP" | python3 -m json.tool 2>/dev/null || echo "$REGISTER_RESP"

ORG_ID=$(echo "$REGISTER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['organization']['id'])" 2>/dev/null)
OWNER_ID=$(echo "$REGISTER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null)
echo "ORG_ID=$ORG_ID"
echo "OWNER_ID=$OWNER_ID"
echo ""

# 2. Login as owner
echo "--- 2. Login as OWNER ---"
LOGIN_RESP=$(curl -s -c "$COOKIE_JAR_OWNER" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@test.com","password":"test1234"}')
echo "$LOGIN_RESP" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESP"
echo ""

# 3. Hit /me
echo "--- 3. GET /auth/me (as owner) ---"
ME_RESP=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/auth/me")
echo "$ME_RESP" | python3 -m json.tool 2>/dev/null || echo "$ME_RESP"
echo ""

# 4. Create a workspace (directly via prisma, since we don't have a full CRUD endpoint yet)
echo "--- 4. Creating workspace + workspace access for OWNER via direct DB ---"
WORKSPACE_SETUP=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/auth/test-setup-workspace" \
  -H "Content-Type: application/json" \
  -d "{\"orgId\":\"$ORG_ID\",\"ownerId\":\"$OWNER_ID\"}" 2>/dev/null)
# Since we don't have that endpoint, let's use a Node script instead
echo "(Creating via node script...)"

# Use node inline to create workspace + grant owner access
WORKSPACE_ID=$(node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  const ws = await prisma.workspace.create({
    data: {
      organizationId: '$ORG_ID',
      brandName: 'Test Client Brand',
      website: 'https://testclient.com',
      cta: 'Shop now',
      defaultHashtags: ['#testbrand', '#agency'],
      brandVoice: 'Professional and friendly',
      emojiStyle: 'minimal',
    },
  });
  // Grant OWNER access
  await prisma.workspaceAccess.create({
    data: { userId: '$OWNER_ID', workspaceId: ws.id },
  });
  console.log(ws.id);
  await prisma.\$disconnect();
  process.exit(0);
}
main();
" 2>/dev/null)
echo "WORKSPACE_ID=$WORKSPACE_ID"
echo ""

# 5. Owner accesses workspace — should succeed
echo "--- 5. Owner accesses workspace (expect 200) ---"
WS_RESP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID")
echo "Status: $WS_RESP"
if [ "$WS_RESP" = "200" ]; then
  echo "✅ PASS: Owner can access workspace"
else
  echo "❌ FAIL: Expected 200, got $WS_RESP"
fi
echo ""

# 6. Register a second user as MEMBER (no workspace access)
echo "--- 6. Register second user (will add as MEMBER) ---"
REG2_RESP=$(curl -s -c "$COOKIE_JAR_MEMBER" -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"member@test.com","password":"test1234","name":"Member User","orgName":"Member Org"}')
MEMBER_ID=$(echo "$REG2_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null)
echo "MEMBER_ID=$MEMBER_ID"

# Add member to the original org with MEMBER role
node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  await prisma.membership.create({
    data: { userId: '$MEMBER_ID', organizationId: '$ORG_ID', role: 'MEMBER' },
  });
  console.log('Member added to org');
  await prisma.\$disconnect();
  process.exit(0);
}
main();
" 2>/dev/null
echo ""

# 7. Login as member
echo "--- 7. Login as MEMBER ---"
curl -s -c "$COOKIE_JAR_MEMBER" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"member@test.com","password":"test1234"}' > /dev/null
echo "Logged in as member"
echo ""

# 8. Member tries to access workspace WITHOUT WorkspaceAccess — should get 403
echo "--- 8. Member accesses workspace WITHOUT access (expect 403) ---"
WS_RESP2=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR_MEMBER" "$BASE/workspaces/$WORKSPACE_ID")
echo "Status: $WS_RESP2"
if [ "$WS_RESP2" = "403" ]; then
  echo "✅ PASS: Member correctly denied (403)"
else
  echo "❌ FAIL: Expected 403, got $WS_RESP2"
fi
echo ""

# 9. Grant member WorkspaceAccess
echo "--- 9. Granting member workspace access ---"
node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  await prisma.workspaceAccess.create({
    data: { userId: '$MEMBER_ID', workspaceId: '$WORKSPACE_ID' },
  });
  console.log('Access granted');
  await prisma.\$disconnect();
  process.exit(0);
}
main();
" 2>/dev/null
echo ""

# 10. Member tries again WITH access — should succeed
echo "--- 10. Member accesses workspace WITH access (expect 200) ---"
WS_RESP3=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR_MEMBER" "$BASE/workspaces/$WORKSPACE_ID")
echo "Status: $WS_RESP3"
if [ "$WS_RESP3" = "200" ]; then
  echo "✅ PASS: Member can now access workspace"
else
  echo "❌ FAIL: Expected 200, got $WS_RESP3"
fi
echo ""

# 11. Unauthenticated request should get 401
echo "--- 11. Unauthenticated request (expect 401) ---"
WS_RESP4=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/workspaces/$WORKSPACE_ID")
echo "Status: $WS_RESP4"
if [ "$WS_RESP4" = "401" ]; then
  echo "✅ PASS: Unauthenticated correctly denied (401)"
else
  echo "❌ FAIL: Expected 401, got $WS_RESP4"
fi
echo ""

echo "=== Phase 1 Verification Complete ==="

# Cleanup
rm -f "$COOKIE_JAR_OWNER" "$COOKIE_JAR_MEMBER"
