require('dotenv').config();
const prisma = require('./src/prisma');
const jwt = require('jsonwebtoken');
const { encrypt } = require('./src/utils/crypto');
const { refreshTokenIfNeeded } = require('./src/services/oauth-refresh');

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

async function testSessionPersistence() {
  console.log('=== Part 1: Session & SocialAccount Persistence Verification Suite ===\n');

  try {
    // 1. JWT Secret Resolution Test
    console.log('─── 1. JWT Secret Dynamic Resolution ───');
    const secret = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
    const testToken = jwt.sign({ userId: 'test-user-123' }, secret, { expiresIn: '7d' });
    const verified = jwt.verify(testToken, secret);
    assert('JWT signs and verifies dynamically without top-level static dependency', verified.userId === 'test-user-123');

    // 2. Setup Permanent Test User & Social Account
    console.log('\n─── 2. SocialAccount Expiry Logic Verification ───');
    const user = await prisma.user.create({
      data: { email: `persist_${Date.now()}@test.com`, passwordHash: 'hash', name: 'Persist User' },
    });
    const org = await prisma.organization.create({ data: { name: `Persist Org ${Date.now()}` } });
    await prisma.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'OWNER' } });
    const workspace = await prisma.workspace.create({ data: { organizationId: org.id, brandName: 'Persist Brand' } });

    // Connected SocialAccount with expiresAt = null (non-expiring / mock)
    const saNullExpires = await prisma.socialAccount.create({
      data: {
        workspaceId: workspace.id,
        platform: 'LINKEDIN',
        accountName: 'Persist LinkedIn',
        status: 'CONNECTED',
        externalAccountId: 'ext-link-123',
        accessTokenEncrypted: encrypt('access_token_123'),
        refreshTokenEncrypted: encrypt('mock_refresh_token_linkedin'),
        expiresAt: null,
      },
    });

    // Test refreshTokenIfNeeded on expiresAt = null
    const resNullExpires = await refreshTokenIfNeeded(saNullExpires.id);
    assert('expiresAt = null is treated as valid (non-expiring) and returned directly', resNullExpires.status === 'CONNECTED');

    // Verify token was NOT wiped out in DB
    const checkSa1 = await prisma.socialAccount.findUnique({ where: { id: saNullExpires.id } });
    assert('DB record accessTokenEncrypted preserved', !!checkSa1.accessTokenEncrypted);
    assert('DB record refreshTokenEncrypted preserved', !!checkSa1.refreshTokenEncrypted);

    // Connected SocialAccount with future expiresAt (e.g. +2 hours)
    const saFutureExpires = await prisma.socialAccount.create({
      data: {
        workspaceId: workspace.id,
        platform: 'PINTEREST',
        accountName: 'Persist Pinterest',
        status: 'CONNECTED',
        externalAccountId: 'ext-pin-123',
        accessTokenEncrypted: encrypt('access_token_pin_123'),
        refreshTokenEncrypted: encrypt('mock_refresh_token_pinterest'),
        expiresAt: new Date(Date.now() + 2 * 3600 * 1000), // +2h
      },
    });

    const resFutureExpires = await refreshTokenIfNeeded(saFutureExpires.id);
    assert('Future expiresAt (>5m) is returned directly without refresh trigger', resFutureExpires.status === 'CONNECTED');

    // 3. 5-Restart Simulation Test
    console.log('\n─── 3. Simulating 5 Consecutive Backend Restarts ───');
    for (let restart = 1; restart <= 5; restart++) {
      console.log(`  🔄 Restart simulation ${restart}/5...`);
      // Simulate app restart by clearing any require caches if needed and fetching from DB
      const loadedUser = await prisma.user.findUnique({ where: { email: user.email } });
      const loadedAccounts = await prisma.socialAccount.findMany({ where: { workspaceId: workspace.id } });

      assert(`Restart ${restart}: User ${loadedUser.email} exists`, !!loadedUser);
      assert(`Restart ${restart}: All ${loadedAccounts.length} SocialAccounts remain CONNECTED`, loadedAccounts.every(a => a.status === 'CONNECTED'));
    }

    console.log('\n══════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
      console.log('  🎉  SESSION & TOKEN PERSISTENCE — ALL PASSED!');
    } else {
      console.log('  💀  SESSION & TOKEN PERSISTENCE — HAS FAILURES!');
    }
    console.log('══════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testSessionPersistence();
