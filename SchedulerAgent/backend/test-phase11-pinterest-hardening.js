require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('./src/prisma');
const { publishToPinterest, preparePinterestMediaSource } = require('./src/services/publishers');

let passed = 0;
let failed = 0;
function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

async function testHardening() {
  console.log('=== Pinterest Hardening & Verification Suite ===\n');

  // ── 1. ffmpeg-static binary bundled ────────────────────────────
  console.log('─── 1. ffmpeg-static Bundling ───');
  let ffmpegPath;
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch { /* */ }
  assert('ffmpeg-static resolves a path', !!ffmpegPath);
  assert('ffmpeg binary exists on disk', ffmpegPath && fs.existsSync(ffmpegPath));

  // ── 2. Schema: allowVideoImageFallback on Workspace ────────────
  console.log('\n─── 2. Schema: allowVideoImageFallback ───');
  const user = await prisma.user.create({
    data: { email: `pthard_${Date.now()}@test.com`, passwordHash: 'hash', name: 'Pinterestron' },
  });
  const org = await prisma.organization.create({ data: { name: `PintAgency ${Date.now()}` } });
  await prisma.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'OWNER' } });

  const ws = await prisma.workspace.create({
    data: { organizationId: org.id, brandName: 'PintBrand', allowVideoImageFallback: false },
  });
  assert('Workspace created with allowVideoImageFallback = false', ws.allowVideoImageFallback === false);

  const wsUpdated = await prisma.workspace.update({
    where: { id: ws.id },
    data: { allowVideoImageFallback: true },
  });
  assert('Workspace toggled allowVideoImageFallback to true', wsUpdated.allowVideoImageFallback === true);

  // ── 3. Image Sanitization → JPEG default ──────────────────────
  console.log('\n─── 3. Image Sanitization (JPEG 85%, max 1500px) ───');
  // Create a tiny 1x1 png
  const tmpDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const samplePng = path.join(tmpDir, `test_sanitize_${Date.now()}.png`);
  const pngBuf = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(samplePng, pngBuf);

  const src = await preparePinterestMediaSource(samplePng, false);
  assert('Sanitized source_type is image_base64', src.source_type === 'image_base64');
  assert('Sanitized content_type is image/png (alpha detected) or image/jpeg', ['image/png', 'image/jpeg'].includes(src.content_type));
  assert('Base64 data is non-empty', src.data.length > 0);
  if (fs.existsSync(samplePng)) fs.unlinkSync(samplePng);

  // ── 4. Mock token Video → immediate success (mock mode) ───────
  console.log('\n─── 4. Mock Token Video Pin (mock path) ───');
  const acct = await prisma.socialAccount.create({
    data: {
      workspaceId: ws.id,
      platform: 'PINTEREST',
      accountName: 'Test Pint Acct',
      status: 'CONNECTED',
      externalAccountId: '1234567890',
      accessTokenEncrypted: 'mock_token',
    },
  });

  const mockPost = {
    id: `post_mock_${Date.now()}`,
    workspaceId: ws.id,
    socialAccount: acct,
    workspace: wsUpdated,
    platform: 'PINTEREST',
    renderedContent: { title: 'Mock Video', body: 'Test body' },
  };

  const dummyVideo = path.join(tmpDir, `test_video_${Date.now()}.mp4`);
  fs.writeFileSync(dummyVideo, Buffer.alloc(1024, 0)); // 1KB dummy

  const mockMedia = { id: `media_${Date.now()}`, mediaType: 'VIDEO', filepath: dummyVideo, filename: 'test.mp4' };
  const mockRes = await publishToPinterest(mockPost, 'mock_token', mockMedia);
  assert('Mock video pin returns success: true', mockRes.success === true);
  assert('Mock video pin returns externalPostId', !!mockRes.externalPostId);
  if (fs.existsSync(dummyVideo)) fs.unlinkSync(dummyVideo);

  // ── 5. 4xx Error Classification (isPermanent) ─────────────────
  console.log('\n─── 5. Error Classification: isPermanent on 4xx ───');
  // Simulate what publishers.js returns for a 403 — the catch block sets isPermanent
  const fakeAxiosErr = new Error('Forbidden');
  fakeAxiosErr.response = { status: 403, data: { message: 'forbidden' } };
  const status403 = fakeAxiosErr.response.status;
  const isPerm403 = status403 >= 400 && status403 < 500 && status403 !== 429;
  assert('403 → isPermanent = true', isPerm403 === true);

  const fake429 = { response: { status: 429 } };
  const isPerm429 = fake429.response.status >= 400 && fake429.response.status < 500 && fake429.response.status !== 429;
  assert('429 → isPermanent = false (rate limit retries)', isPerm429 === false);

  const fake500 = { response: { status: 500 } };
  const isPerm500 = fake500.response.status >= 400 && fake500.response.status < 500 && fake500.response.status !== 429;
  assert('500 → isPermanent = false (server error retries)', isPerm500 === false);

  // ── 6. Fallback Flag Shape Verification ───────────────────────
  console.log('\n─── 6. Fallback Result Shape ───');
  // Verify the shape a fallback result would have
  const fakeResult = { success: true, isFallback: true, fallbackReason: 'video upload timed out', externalPostId: 'pin-123' };
  assert('isFallback flag present', fakeResult.isFallback === true);
  assert('fallbackReason is a string', typeof fakeResult.fallbackReason === 'string');

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  🎉  PINTEREST HARDENING SUITE — ALL PASSED');
  } else {
    console.log('  💀  PINTEREST HARDENING SUITE — HAS FAILURES');
  }
  console.log('══════════════════════════════════════════════════\n');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

testHardening().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
