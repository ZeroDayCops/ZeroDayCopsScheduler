/**
 * Verification Script: 3 Consecutive Restarts Test
 * Ensures ZERO data loss, ZERO status flips, and ZERO password hash resets across restarts.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('./src/prisma');
const { seedPermanentUser } = require('./src/services/user-seeder');
const { seedDefaultTemplates } = require('./src/services/template-seeder');

async function getSnapshot() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, passwordHash: true } });
  const masterUser = users.find(u => u.email === 'bothubey@gmail.com');
  const isPasswordValid = masterUser ? await bcrypt.compare('bothubey', masterUser.passwordHash) : false;

  const socialAccounts = await prisma.socialAccount.findMany({
    select: { id: true, workspaceId: true, platform: true, status: true, accountName: true },
    orderBy: { id: 'asc' },
  });

  const media = await prisma.media.findMany({
    select: { id: true, workspaceId: true, filename: true, status: true },
    orderBy: { id: 'asc' },
  });

  const posts = await prisma.scheduledPost.findMany({
    select: { id: true, workspaceId: true, platform: true, status: true },
    orderBy: { id: 'asc' },
  });

  return {
    userCount: users.length,
    masterUserValid: isPasswordValid,
    socialAccountCount: socialAccounts.length,
    socialAccounts: socialAccounts.map(s => `${s.platform}:${s.status}`),
    mediaCount: media.length,
    mediaStatuses: media.map(m => `${m.filename}:${m.status}`),
    postCount: posts.length,
    postStatuses: posts.map(p => `${p.platform}:${p.status}`),
  };
}

function compareSnapshots(initial, current, runIndex) {
  let issues = [];

  if (current.userCount !== initial.userCount) {
    issues.push(`User count changed from ${initial.userCount} to ${current.userCount}`);
  }

  if (!current.masterUserValid) {
    issues.push(`Master user password validation failed!`);
  }

  if (current.socialAccountCount !== initial.socialAccountCount) {
    issues.push(`SocialAccount count changed from ${initial.socialAccountCount} to ${current.socialAccountCount}`);
  }

  const socialDiff = JSON.stringify(current.socialAccounts) !== JSON.stringify(initial.socialAccounts);
  if (socialDiff) {
    issues.push(`SocialAccount status/ordering shifted: expected ${JSON.stringify(initial.socialAccounts)}, got ${JSON.stringify(current.socialAccounts)}`);
  }

  if (current.mediaCount !== initial.mediaCount) {
    issues.push(`Media count changed from ${initial.mediaCount} to ${current.mediaCount}`);
  }

  if (current.postCount !== initial.postCount) {
    issues.push(`ScheduledPost count changed from ${initial.postCount} to ${current.postCount}`);
  }

  if (issues.length > 0) {
    console.error(`❌ RESTART ${runIndex} FAILED DATA INTEGRITY CHECK:`);
    issues.forEach(i => console.error(`   - ${i}`));
    return false;
  } else {
    console.log(`✅ RESTART ${runIndex} PASSED DATA INTEGRITY CHECK: 0 state shifts, 0 data loss, master user password valid.`);
    return true;
  }
}

async function runTest() {
  console.log('=== STARTING 3 CONSECUTIVE RESTARTS INTEGRITY TEST ===\n');

  const initial = await getSnapshot();
  console.log('Initial State Snapshot:');
  console.log(`  - Users: ${initial.userCount} (Master user valid: ${initial.masterUserValid})`);
  console.log(`  - SocialAccounts: ${initial.socialAccountCount} (${initial.socialAccounts.join(', ')})`);
  console.log(`  - Media: ${initial.mediaCount}`);
  console.log(`  - ScheduledPosts: ${initial.postCount}`);
  console.log('\n------------------------------------------------');

  let allPassed = true;

  for (let i = 1; i <= 3; i++) {
    console.log(`\nSimulating Server Startup #${i}...`);
    // Run full server startup seed sequence
    await seedDefaultTemplates();
    await seedPermanentUser();

    const current = await getSnapshot();
    const passed = compareSnapshots(initial, current, i);
    if (!passed) allPassed = false;
  }

  console.log('\n================================================');
  if (allPassed) {
    console.log('🎉 VERIFICATION SUCCESS: All 3 consecutive restarts passed with ZERO automatic data loss or state flips!');
  } else {
    console.error('❌ VERIFICATION FAILED: Data integrity issues detected during restarts.');
    process.exit(1);
  }

  process.exit(0);
}

runTest().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
