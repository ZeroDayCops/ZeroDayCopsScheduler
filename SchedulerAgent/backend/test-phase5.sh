#!/bin/bash
# Phase 5 Verification Script

BASE="http://localhost:3001/api"
COOKIE_JAR_OWNER="/tmp/sa_owner_cookies.txt"

echo "=== Phase 5 Verification ==="
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

# 4. Upload dummy asset
echo "--- 4. Uploading dummy asset ---"
DUMMY_IMAGE="/tmp/test-image.jpg"
echo "fake image content" > "$DUMMY_IMAGE"

UPLOAD_RESP=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/workspaces/$WORKSPACE_ID/media" \
  -F "file=@$DUMMY_IMAGE")
MEDIA_ID=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['media']['id'])" 2>/dev/null)
echo "MEDIA_ID=$MEDIA_ID"

# Await status ANALYZED
for i in {1..10}; do
  MEDIA_CHECK=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID/media")
  MEDIA_STATUS=$(echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(next(m for m in json.load(sys.stdin)['media'] if m['id']=='$MEDIA_ID')['status'])" 2>/dev/null)
  if [ "$MEDIA_STATUS" = "ANALYZED" ]; then
    echo "Media is ANALYZED."
    break
  fi
  sleep 1
done
echo ""

# 5. Schedule Post (due in 2 seconds)
echo "--- 5. Schedule Post ---"
SCHEDULED_TIME=$(date -u -d "2 seconds" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v+2s +"%Y-%m-%dT%H:%M:%SZ")
echo "Scheduling for: $SCHEDULED_TIME"

POST_RESP=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/workspaces/$WORKSPACE_ID/scheduled-posts" \
  -H "Content-Type: application/json" \
  -d "{\"mediaId\":\"$MEDIA_ID\",\"platform\":\"LINKEDIN\",\"scheduledFor\":\"$SCHEDULED_TIME\"}")
echo "$POST_RESP" | python3 -m json.tool 2>/dev/null || echo "$POST_RESP"
POST_ID=$(echo "$POST_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['post']['id'])" 2>/dev/null)
echo "POST_ID=$POST_ID"
echo ""

# Wait 3 seconds so post becomes due
echo "Waiting 3 seconds for scheduled post to become due..."
sleep 3
echo ""

# 6. Test Double Claim concurrency
echo "--- 6. Test Double-Claim Concurrency ---"
echo "Triggering two claims concurrently using node parallel promises..."

node -r dotenv/config -e "
const prisma = require('./src/prisma');
const { claimDuePosts } = require('./src/services/scheduler');
async function main() {
  const [res1, res2] = await Promise.all([
    claimDuePosts(),
    claimDuePosts()
  ]);
  console.log('Claim 1 returned count:', res1.length);
  console.log('Claim 2 returned count:', res2.length);
  
  if (res1.length + res2.length === 1 && (res1.length === 0 || res2.length === 0)) {
    console.log('✅ PASS: Double-claim safety verified! Only one call claimed the post.');
    
    // Simulate processing the claimed post
    const claimed = res1.concat(res2);
    for (const post of claimed) {
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          externalPostId: 'fake-post-id-' + post.id
        }
      });
      console.log('Processed claimed post to PUBLISHED');
    }
  } else {
    console.error('❌ FAIL: Double-claim failed! Both claimed it, or count mismatch.');
  }
  process.exit(0);
}
main().catch(console.error);
"
echo ""

# 8. Check post status in database
echo "--- 8. Verify post is PUBLISHED ---"
MEDIA_CHECK=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID/calendar?from=$(date -u -d '1 day ago' +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v-1d +'%Y-%m-%dT%H:%M:%SZ')&to=$(date -u -d '1 day' +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v+1d +'%Y-%m-%dT%H:%M:%SZ')")
echo "$MEDIA_CHECK" | python3 -m json.tool 2>/dev/null || echo "$MEDIA_CHECK"
echo ""

echo "=== Phase 5 Verification Complete ==="

# Cleanup temp files
rm -f "$DUMMY_IMAGE" "$COOKIE_JAR_OWNER"
