#!/bin/bash
# Phase 3 Verification Script

BASE="http://localhost:3001/api"
COOKIE_JAR_OWNER="/tmp/sa_owner_cookies.txt"

echo "=== Phase 3 Verification ==="
echo ""

# 1. Clean DB first
node -r dotenv/config -e "
const prisma = require('./src/prisma');
async function main() {
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

# 4. Generate dummy file to upload
echo "--- 4. Generating dummy image file ---"
DUMMY_IMAGE="/tmp/test-image.jpg"
echo "fake image content" > "$DUMMY_IMAGE"
echo "Generated $DUMMY_IMAGE"
echo ""

# 5. Manual upload via Multer endpoint
echo "--- 5. Manual upload via Multer (expect 201) ---"
UPLOAD_RESP=$(curl -s -b "$COOKIE_JAR_OWNER" -X POST "$BASE/workspaces/$WORKSPACE_ID/media" \
  -F "file=@$DUMMY_IMAGE")
echo "$UPLOAD_RESP" | python3 -m json.tool 2>/dev/null || echo "$UPLOAD_RESP"
MEDIA_ID1=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['media']['id'])" 2>/dev/null)
echo "MEDIA_ID1=$MEDIA_ID1"
echo ""

# 6. Poll until manually uploaded file transitions from NEW -> ANALYZING -> ANALYZED
echo "--- 6. Polling manual media status ---"
for i in {1..10}; do
  MEDIA_CHECK=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID/media")
  MEDIA_STATUS=$(echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(next(m for m in json.load(sys.stdin)['media'] if m['id']=='$MEDIA_ID1')['status'])" 2>/dev/null)
  echo "Poll $i: Status is $MEDIA_STATUS"
  if [ "$MEDIA_STATUS" = "ANALYZED" ]; then
    echo "✅ PASS: Manually uploaded media analyzed successfully!"
    # Display the stored aiMasterJson
    echo "aiMasterJson:"
    echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(json.dumps(next(m for m in json.load(sys.stdin)['media'] if m['id']=='$MEDIA_ID1')['aiMasterJson'], indent=2))"
    break
  fi
  sleep 1.5
done
echo ""

# 7. Drop file into workspace's upload folder for watcher ingestion
echo "--- 7. Ingestion via Watch-folder ---"
WORKSPACE_UPLOAD_DIR="../uploads/$WORKSPACE_ID"
mkdir -p "$WORKSPACE_UPLOAD_DIR"
WATCH_IMAGE="$WORKSPACE_UPLOAD_DIR/watch-image.jpg"
echo "fake image content 2" > "$WATCH_IMAGE"
echo "Dropped file into watch directory: $WATCH_IMAGE"
echo "Waiting for watcher stability threshold (2s)..."
sleep 2.5

# Fetch media list and find the new file
MEDIA_CHECK=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID/media")
MEDIA_ID2=$(echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(next(m for m in json.load(sys.stdin)['media'] if m['filename']=='watch-image.jpg')['id'])" 2>/dev/null)
echo "MEDIA_ID2=$MEDIA_ID2"

if [ -n "$MEDIA_ID2" ]; then
  echo "✅ PASS: Watcher successfully created Media row!"
else
  echo "❌ FAIL: Media row not created by watcher."
fi
echo ""

# 8. Poll until watched file transitions to ANALYZED
echo "--- 8. Polling watch-folder media status ---"
for i in {1..10}; do
  MEDIA_CHECK=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID/media")
  MEDIA_STATUS=$(echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(next(m for m in json.load(sys.stdin)['media'] if m['id']=='$MEDIA_ID2')['status'])" 2>/dev/null)
  echo "Poll $i: Status is $MEDIA_STATUS"
  if [ "$MEDIA_STATUS" = "ANALYZED" ]; then
    echo "✅ PASS: Watched media analyzed successfully!"
    break
  fi
  sleep 1.5
done
echo ""

# 9. Drop a corrupt/bad file to verify graceful failure
echo "--- 9. Graceful failure on bad/corrupt file ---"
CORRUPT_IMAGE="$WORKSPACE_UPLOAD_DIR/bad-image.jpg"
echo "corrupt image content" > "$CORRUPT_IMAGE"
echo "Dropped file: $CORRUPT_IMAGE"
echo "Waiting for watcher stability threshold (2s)..."
sleep 2.5

MEDIA_CHECK=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID/media")
MEDIA_ID3=$(echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(next(m for m in json.load(sys.stdin)['media'] if m['filename']=='bad-image.jpg')['id'])" 2>/dev/null)
echo "MEDIA_ID3=$MEDIA_ID3"

# Poll status of corrupt file - should transition to FAILED
for i in {1..10}; do
  MEDIA_CHECK=$(curl -s -b "$COOKIE_JAR_OWNER" "$BASE/workspaces/$WORKSPACE_ID/media")
  MEDIA_STATUS=$(echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(next(m for m in json.load(sys.stdin)['media'] if m['id']=='$MEDIA_ID3')['status'])" 2>/dev/null)
  echo "Poll $i: Status is $MEDIA_STATUS"
  if [ "$MEDIA_STATUS" = "FAILED" ]; then
    echo "✅ PASS: Bad/corrupt file transitioned to FAILED status gracefully!"
    # Display error stored in json
    echo "aiMasterJson:"
    echo "$MEDIA_CHECK" | python3 -c "import sys,json; print(json.dumps(next(m for m in json.load(sys.stdin)['media'] if m['id']=='$MEDIA_ID3')['aiMasterJson'], indent=2))"
    break
  fi
  sleep 1.5
done
echo ""

# 10. Check if the server is still running (did not crash)
echo "--- 10. Server health check ---"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
echo "Server Health HTTP Status: $HEALTH"
if [ "$HEALTH" = "200" ]; then
  echo "✅ PASS: Ingestion worker/watcher did not crash the server!"
else
  echo "❌ FAIL: Server is down!"
fi
echo ""

echo "=== Phase 3 Verification Complete ==="

# Cleanup temp files
rm -f "$DUMMY_IMAGE" "$COOKIE_JAR_OWNER"
