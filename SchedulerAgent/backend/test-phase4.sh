#!/bin/bash
# Phase 4 Verification Script

BASE="http://localhost:3001/api"
COOKIE_JAR_OWNER="/tmp/sa_owner_cookies.txt"

echo "=== Phase 4 Verification ==="
echo ""

# 1. Clean DB first
node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  await prisma.template.deleteMany({ where: { NOT: { id: { startsWith: 'default-' } } } }); // keep defaults
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

# 4. Generate dummy image file & upload
echo "--- 4. Uploading dummy IMAGE asset ---"
DUMMY_IMAGE="/tmp/test-image.jpg"
echo "fake image content" > "$DUMMY_IMAGE"

UPLOAD_RESP=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/workspaces/$WORKSPACE_ID/media" \
  -F "file=@$DUMMY_IMAGE")
MEDIA_ID1=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['media']['id'])" 2>/dev/null)
echo "IMAGE_MEDIA_ID=$MEDIA_ID1"

# Await status ANALYZED
for i in {1..10}; do
  MEDIA_CHECK=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID/media")
  MEDIA_STATUS=$(echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(next(m for m in json.load(sys.stdin)['media'] if m['id']=='$MEDIA_ID1')['status'])" 2>/dev/null)
  if [ "$MEDIA_STATUS" = "ANALYZED" ]; then
    echo "IMAGE media is ANALYZED."
    break
  fi
  sleep 1
done
echo ""

# 5. Preview IMAGE on LinkedIn (should succeed)
echo "--- 5. Preview IMAGE on LinkedIn ---"
PREVIEW_LI=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/media/$MEDIA_ID1/preview?platform=linkedin")
echo "$PREVIEW_LI" | python3 -m json.tool 2>/dev/null || echo "$PREVIEW_LI"
echo ""

# 6. Preview IMAGE on Pinterest (should succeed)
echo "--- 6. Preview IMAGE on Pinterest ---"
PREVIEW_PIN=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/media/$MEDIA_ID1/preview?platform=pinterest")
echo "$PREVIEW_PIN" | python3 -m json.tool 2>/dev/null || echo "$PREVIEW_PIN"
echo ""

# 7. Preview IMAGE on YouTube (should FAIL with clear validation error)
echo "--- 7. Preview IMAGE on YouTube (expect 400 error) ---"
PREVIEW_YT=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/media/$MEDIA_ID1/preview?platform=youtube")
echo "$PREVIEW_YT" | python3 -m json.tool 2>/dev/null || echo "$PREVIEW_YT"
echo ""

# 8. Upload dummy VIDEO asset & preview on YouTube (should succeed)
echo "--- 8. Uploading and previewing VIDEO on YouTube ---"
DUMMY_VIDEO="/tmp/test-video.mp4"
echo "fake video content" > "$DUMMY_VIDEO"

UPLOAD_RESP2=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/workspaces/$WORKSPACE_ID/media" \
  -F "file=@$DUMMY_VIDEO")
MEDIA_ID2=$(echo "$UPLOAD_RESP2" | python3 -c "import sys,json; print(json.load(sys.stdin)['media']['id'])" 2>/dev/null)
echo "VIDEO_MEDIA_ID=$MEDIA_ID2"

# Await status ANALYZED
for i in {1..10}; do
  MEDIA_CHECK=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID/media")
  MEDIA_STATUS=$(echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(next(m for m in json.load(sys.stdin)['media'] if m['id']=='$MEDIA_ID2')['status'])" 2>/dev/null)
  if [ "$MEDIA_STATUS" = "ANALYZED" ]; then
    echo "VIDEO media is ANALYZED."
    break
  fi
  sleep 1
done

PREVIEW_YT2=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/media/$MEDIA_ID2/preview?platform=youtube")
echo "$PREVIEW_YT2" | python3 -m json.tool 2>/dev/null || echo "$PREVIEW_YT2"
echo ""

# 9. Create customized workspace template for Pinterest with long body (to trigger warnings)
echo "--- 9. Creating custom template for Pinterest (exceeding character limit) ---"
LONG_BODY="This is a super long template body. {{description}} \
We want to write a ton of useless words here to verify that the Pinterest character limit validation of 500 characters works properly and flags a validation warning! \
Let's keep repeating: validation check! validation check! validation check! validation check! validation check! validation check! validation check! validation check! \
validation check! validation check! validation check! validation check! validation check! validation check! validation check! validation check!"

TEMPLATE_BODY="$LONG_BODY" WORKSPACE_ID="$WORKSPACE_ID" node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
  await prisma.template.create({
    data: {
      workspaceId: process.env.WORKSPACE_ID,
      platform: 'PINTEREST',
      name: 'Custom Long Pinterest Template',
      templateBody: process.env.TEMPLATE_BODY,
      isDefault: false
    }
  });
  console.log('Custom template created');
  await prisma.\$disconnect();
  process.exit(0);
}
main().catch(console.error);
"
echo ""

# 10. Preview with the long custom template to verify warnings
echo "--- 10. Previewing custom long template on Pinterest (expecting warning) ---"
PREVIEW_WARN=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/media/$MEDIA_ID1/preview?platform=pinterest")
echo "$PREVIEW_WARN" | python3 -m json.tool 2>/dev/null || echo "$PREVIEW_WARN"
echo ""

echo "=== Phase 4 Verification Complete ==="

# Cleanup temp files
rm -f "$DUMMY_IMAGE" "$DUMMY_VIDEO" "$COOKIE_JAR_OWNER"
