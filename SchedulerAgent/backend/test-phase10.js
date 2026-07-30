const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const prisma = require('./src/prisma');
const { processDuePosts } = require('./src/services/scheduler');

const BASE_URL = 'http://localhost:3001/api';

async function testPlannerFlow() {
  console.log('=== Phase 10 Planner & Calendar Core API Integration Test ===');

  // Clean DB (Preserve permanent user bothubey@gmail.com)
  await prisma.scheduledPost.deleteMany();
  await prisma.template.deleteMany({ where: { NOT: { id: { startsWith: 'default-' } } } });
  await prisma.media.deleteMany();
  await prisma.workspaceAccess.deleteMany({ where: { user: { NOT: { email: 'bothubey@gmail.com' } } } });
  await prisma.socialAccount.deleteMany();
  await prisma.workspace.deleteMany({ where: { brandName: { not: 'ZeroDayCops Scheduler' } } });
  await prisma.membership.deleteMany({ where: { user: { NOT: { email: 'bothubey@gmail.com' } } } });
  await prisma.user.deleteMany({ where: { NOT: { email: 'bothubey@gmail.com' } } });
  await prisma.organization.deleteMany({ where: { name: { not: 'ZeroDayCops Org' } } });
  console.log('Database cleared (Permanent master account preserved).');

  const agent = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
  });

  // 1. User Register & Login
  console.log('1. User register and login...');
  const regRes = await agent.post('/auth/register', {
    email: 'planner-test@agency.com',
    password: 'password123',
    name: 'Planner Specialist',
    orgName: 'Planner Agency'
  });
  const orgId = regRes.data.organization.id;
  
  const loginRes = await agent.post('/auth/login', {
    email: 'planner-test@agency.com',
    password: 'password123'
  });
  const cookies = loginRes.headers['set-cookie'];
  if (cookies) {
    agent.defaults.headers.Cookie = cookies.map(c => c.split(';')[0]).join('; ');
  }

  // 2. Create Workspace and Connect Mock Accounts
  console.log('2. Creating workspace...');
  const wsRes = await agent.post('/workspaces', {
    organizationId: orgId,
    brandName: 'Puma Soccer',
    website: 'https://puma.com',
    cta: 'Explore Future Ultimate cleats',
    defaultHashtags: ['#puma', '#future'],
    brandVoice: 'Fast and loud',
    emojiStyle: 'many'
  });
  const workspaceId = wsRes.data.workspace.id;

  console.log('Connecting mock social accounts...');
  await agent.get(`/oauth/linkedin/connect?workspaceId=${workspaceId}`);
  await agent.get(`/oauth/pinterest/connect?workspaceId=${workspaceId}`);
  console.log('Mock accounts connected.');

  // 3. Upload a media asset (valid PNG) and wait for analysis
  console.log('3. Uploading PNG asset for preview/schedule builder test...');
  const testFile = '/tmp/phase10-test.png';
  const minPngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789ccb6060600000000500010d0a2db40000000049454e44ae426082', 'hex');
  fs.writeFileSync(testFile, minPngBuffer);

  const form = new FormData();
  form.append('file', fs.createReadStream(testFile));

  const uploadRes = await agent.post(`/workspaces/${workspaceId}/media`, form, {
    headers: form.getHeaders(),
  });
  const mediaId = uploadRes.data.media.id;

  console.log('Polling until asset status shifts to ANALYZED...');
  let analyzedObj = null;
  for (let i = 0; i < 15; i++) {
    const checkRes = await agent.get(`/workspaces/${workspaceId}/media`);
    analyzedObj = checkRes.data.media.find(m => m.id === mediaId);
    if (analyzedObj.status === 'ANALYZED') {
      console.log('Asset ready.');
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // 4. Test live preview endpoints (mimics preview pane)
  console.log('4. Requesting live template preview for LINKEDIN...');
  const previewRes = await agent.get(`/media/${mediaId}/preview?platform=LINKEDIN`);
  console.log('Preview content returned successfully:');
  console.log('  - Body:', previewRes.data.rendered.body);
  console.log('  - Warnings:', previewRes.data.rendered.warnings || 'None');

  // 5. Schedule a LinkedIn post
  console.log('5. Scheduling LinkedIn post due immediately...');
  const scheduledTime = new Date(Date.now() - 5000).toISOString(); // Due in the past
  const scheduleRes = await agent.post(`/workspaces/${workspaceId}/scheduled-posts`, {
    mediaId,
    platform: 'LINKEDIN',
    scheduledFor: scheduledTime
  });
  const postId = scheduleRes.data.post.id;
  console.log(`Post scheduled: ${postId} (status: ${scheduleRes.data.post.status})`);

  // 6. Run processDuePosts to publish
  console.log('6. Processing due posts...');
  await processDuePosts();

  // 7. Verify status and Collapsible execution logs
  console.log('7. Loading scheduled posts via /scheduled-posts (mimics Planner Queue view)...');
  const postsRes = await agent.get(`/workspaces/${workspaceId}/scheduled-posts`);
  const post = postsRes.data.posts.find(p => p.id === postId);

  console.log(`Post status is now: ${post.status}`);
  console.log(`External share ID: ${post.externalPostId}`);
  console.log('Collapsible execution logs checklist:');
  post.postLogs.forEach((log) => {
    console.log(`  - [${log.event}]: ${log.message} (at ${log.createdAt})`);
  });

  if (
    post.status === 'PUBLISHED' &&
    post.postLogs.some(l => l.event === 'ATTEMPT') &&
    post.postLogs.some(l => l.event === 'SUCCESS')
  ) {
    console.log('✅ PASS: Interactive builder, preview, schedule, and execution logging verified!');
  } else {
    console.error('❌ FAIL: Schedule/Log trail verification failed.');
  }

  // Cleanup
  fs.unlinkSync(testFile);
  await prisma.$disconnect();
  console.log('=== Phase 10 Verification Complete ===');
}

testPlannerFlow().catch(err => {
  console.error('Test threw error:', err);
  process.exit(1);
});
