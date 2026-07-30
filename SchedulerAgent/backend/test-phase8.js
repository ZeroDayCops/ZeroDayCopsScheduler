const axios = require('axios');
const prisma = require('./src/prisma');

const BASE_URL = 'http://localhost:3001/api';

async function testFrontendFlow() {
  console.log('=== Phase 8 Frontend API Integration Test ===');
  
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

  // Create an Axios instance to persist cookies automatically (like a browser)
  const agent = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
  });

  // 1. Register User (mimics Register Form submit)
  console.log('1. Registering user...');
  const regRes = await agent.post('/auth/register', {
    email: 'test-user@agency.com',
    password: 'password123',
    name: 'Test UI User',
    orgName: 'UI Tech Agency'
  });
  
  const orgId = regRes.data.organization.id;
  const userId = regRes.data.user.id;
  console.log(`Registered user: ${userId} in Org: ${orgId}`);

  // 2. Login User (mimics Login Form submit)
  console.log('2. Logging in...');
  const loginRes = await agent.post('/auth/login', {
    email: 'test-user@agency.com',
    password: 'password123'
  });
  
  // Extract and set Cookie header manually for axios instance from set-cookie headers
  const cookies = loginRes.headers['set-cookie'];
  if (cookies) {
    agent.defaults.headers.Cookie = cookies.map(c => c.split(';')[0]).join('; ');
  }
  console.log('Logged in successfully.');

  // 3. Me endpoint check (mimics Context load on startup)
  console.log('3. Loading user session via /auth/me...');
  const meRes = await agent.get('/auth/me');
  console.log('Session user name:', meRes.data.user.name);
  console.log('User belongs to organizations count:', meRes.data.organizations.length);

  // 4. Create Workspace (mimics Workspace creation dropdown/modal)
  console.log('4. Creating workspace...');
  const wsRes = await agent.post('/workspaces', {
    organizationId: orgId,
    brandName: 'Nike Zoom',
    website: 'https://nike.com',
    cta: 'Get Zoom shoes',
    defaultHashtags: ['#nike', '#zoom'],
    brandVoice: 'Inspirational',
    emojiStyle: 'minimal'
  });
  
  const workspaceId = wsRes.data.workspace.id;
  console.log(`Workspace created: ${workspaceId} (${wsRes.data.workspace.brandName})`);

  // Verify social accounts connected count (should be 3 in NOT_CONNECTED status)
  console.log('Workspace social accounts connection status on creation:');
  wsRes.data.workspace.socialAccounts.forEach(sa => {
    console.log(`  - ${sa.platform}: ${sa.status}`);
  });

  // 5. Update brand settings (mimics Brand Settings Form save)
  console.log('5. Saving modified brand settings...');
  const updatedWsRes = await agent.put(`/workspaces/${workspaceId}`, {
    brandName: 'Nike Zoom Athletics',
    website: 'https://nike.com/athletics',
    cta: 'Get zoom shoes today!',
    brandVoice: 'Super energetic and athletic',
    emojiStyle: 'many',
    defaultHashtags: ['#nike', '#zoom', '#athletics']
  });
  
  console.log('Saved workspace brand name:', updatedWsRes.data.workspace.brandName);
  console.log('Saved default hashtags:', updatedWsRes.data.workspace.defaultHashtags);

  // 6. Connect LinkedIn via connect & callback (mimics Connect button click + popup callback redirection)
  console.log('6. Simulating Connect button click for LinkedIn...');
  // Follow mock redirect loop using the axios agent
  const connectRes = await agent.get(`/oauth/linkedin/connect?workspaceId=${workspaceId}`);
  
  // The response contains the HTML document indicating success
  if (connectRes.data.includes('Connection Successful!')) {
    console.log('✅ Success: Connect redirect callback loop completed and returned HTML confirmation page.');
  } else {
    console.error('❌ Fail: Callback did not return confirmation page.');
  }

  // 7. Verify status updated in workspace (mimics 3-second settings page polling interval)
  console.log('7. Verifying connection status updated in database...');
  const pollRes = await agent.get(`/workspaces/${workspaceId}`);
  const linkedinAccount = pollRes.data.workspace.socialAccounts.find(sa => sa.platform === 'LINKEDIN');
  console.log(`LinkedIn connection status is now: ${linkedinAccount.status}`);
  console.log(`LinkedIn account name: ${linkedinAccount.accountName}`);

  if (linkedinAccount.status === 'CONNECTED' && linkedinAccount.accountName.toLowerCase().includes('linkedin')) {
    console.log('✅ PASS: Real-time status update loop verified!');
  } else {
    console.error('❌ FAIL: Status update loop failed.');
  }

  await prisma.$disconnect();
  console.log('=== Test Complete ===');
}

testFrontendFlow().catch(err => {
  console.error('Test threw error:', err);
  process.exit(1);
});
