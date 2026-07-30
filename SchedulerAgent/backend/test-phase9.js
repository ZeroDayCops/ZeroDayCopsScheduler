const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const prisma = require('./src/prisma');

const BASE_URL = 'http://localhost:3001/api';

async function testMediaLibraryFlow() {
  console.log('=== Phase 9 Media Library API Integration Test ===');

  // Clean DB
  await prisma.scheduledPost.deleteMany();
  await prisma.template.deleteMany({ where: { NOT: { id: { startsWith: 'default-' } } } });
  await prisma.media.deleteMany();
  await prisma.workspaceAccess.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  console.log('Database cleared.');

  const agent = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
  });

  // 1. Register and Login
  console.log('1. User register and login...');
  const regRes = await agent.post('/auth/register', {
    email: 'media-test@agency.com',
    password: 'password123',
    name: 'Media Admin',
    orgName: 'Media Agency'
  });
  const orgId = regRes.data.organization.id;
  
  const loginRes = await agent.post('/auth/login', {
    email: 'media-test@agency.com',
    password: 'password123'
  });
  const cookies = loginRes.headers['set-cookie'];
  if (cookies) {
    agent.defaults.headers.Cookie = cookies.map(c => c.split(';')[0]).join('; ');
  }

  // 2. Create workspace
  console.log('2. Creating workspace...');
  const wsRes = await agent.post('/workspaces', {
    organizationId: orgId,
    brandName: 'Adidas Soccer',
    website: 'https://adidas.com',
    cta: 'Grab Predator cleats',
    defaultHashtags: ['#adidas', '#predator'],
    brandVoice: 'Confident and energetic',
    emojiStyle: 'minimal'
  });
  const workspaceId = wsRes.data.workspace.id;

  // 3. Upload file via multipart/form-data
  console.log('3. Simulating drag-and-drop file upload to POST /workspaces/:id/media...');
  const testFile = '/tmp/phase9-test.png';
  const minPngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789ccb6060600000000500010d0a2db40000000049454e44ae426082', 'hex');
  fs.writeFileSync(testFile, minPngBuffer);
  
  const form = new FormData();
  form.append('file', fs.createReadStream(testFile));

  const uploadRes = await agent.post(`/workspaces/${workspaceId}/media`, form, {
    headers: form.getHeaders(),
  });
  const mediaId = uploadRes.data.media.id;
  console.log(`Uploaded media id: ${mediaId}. Initial status: ${uploadRes.data.media.status}`);

  // 4. Poll status until it shifts from NEW -> ANALYZING -> ANALYZED
  console.log('4. Polling database for status shift to ANALYZED (max 10s)...');
  let status = uploadRes.data.media.status;
  for (let i = 0; i < 15; i++) {
    const checkRes = await agent.get(`/workspaces/${workspaceId}/media`);
    const mediaObj = checkRes.data.media.find(m => m.id === mediaId);
    status = mediaObj.status;
    console.log(`  - Poll ${i + 1}: status = ${status}`);
    
    if (status === 'ANALYZED') {
      console.log('✅ Success: Media analysis transitioned to ANALYZED!');
      console.log('Parsed Gemini AI copy metadata (aiMasterJson):');
      console.log(JSON.stringify(mediaObj.aiMasterJson, null, 2));
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (status !== 'ANALYZED') {
    throw new Error(`Media failed to transition to ANALYZED, current status is: ${status}`);
  }

  // 5. Verify sharp-resized thumbnail endpoint and original file endpoint
  console.log('5. Verifying media file download and sharp-resized thumbnail...');
  const fileRes = await agent.get(`/media/${mediaId}/file`);
  console.log('Original File endpoint returned status:', fileRes.status);
  
  const thumbRes = await agent.get(`/media/${mediaId}/thumbnail`, { responseType: 'arraybuffer' });
  console.log('Thumbnail endpoint returned status:', thumbRes.status);
  console.log('Thumbnail Buffer size in bytes:', thumbRes.data.length);

  if (fileRes.status === 200 && thumbRes.status === 200 && thumbRes.data.length > 0) {
    console.log('✅ PASS: Media Library API and thumbnail endpoints verified!');
  } else {
    console.error('❌ FAIL: File or thumbnail check failed.');
  }

  // Cleanup file
  fs.unlinkSync(testFile);
  await prisma.$disconnect();
  console.log('=== Phase 9 Verification Complete ===');
}

testMediaLibraryFlow().catch(err => {
  console.error('Test threw error:', err);
  process.exit(1);
});
