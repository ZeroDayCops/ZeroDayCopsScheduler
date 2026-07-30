/**
 * One-time repair script: ensures every Workspace has exactly
 * one SocialAccount row per platform (LINKEDIN, PINTEREST, YOUTUBE).
 * Inserts NOT_CONNECTED rows for any that are missing.
 */
require('dotenv').config();
const prisma = require('./src/prisma');

const PLATFORMS = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];

async function repair() {
  console.log('[REPAIR] Checking all workspaces for missing SocialAccount rows...');

  const workspaces = await prisma.workspace.findMany({
    include: { socialAccounts: true },
  });

  let totalInserted = 0;

  for (const ws of workspaces) {
    const existingPlatforms = new Set(ws.socialAccounts.map(sa => sa.platform));
    const missing = PLATFORMS.filter(p => !existingPlatforms.has(p));

    if (missing.length === 0) {
      console.log(`  ✓ Workspace "${ws.brandName}" (${ws.id}) — all 3 platforms present.`);
      continue;
    }

    console.log(`  ✗ Workspace "${ws.brandName}" (${ws.id}) — missing: ${missing.join(', ')}`);

    await prisma.socialAccount.createMany({
      data: missing.map(platform => ({
        workspaceId: ws.id,
        platform,
        status: 'NOT_CONNECTED',
      })),
    });

    totalInserted += missing.length;
    console.log(`    → Inserted ${missing.length} NOT_CONNECTED row(s).`);
  }

  console.log(`\n[REPAIR] Done. Inserted ${totalInserted} total SocialAccount row(s).`);

  // Verify the target workspace
  const targetId = '2cf48a06-9ac4-449f-8661-4832bb784308';
  const verify = await prisma.socialAccount.findMany({
    where: { workspaceId: targetId },
    orderBy: { platform: 'asc' },
  });

  console.log(`\n[VERIFY] SocialAccount rows for workspace ${targetId}:`);
  verify.forEach(sa => {
    console.log(`  ${sa.platform} → ${sa.status} (id: ${sa.id})`);
  });

  if (verify.length === 3) {
    console.log('\n✅ All 3 platform rows confirmed for ZeroDayCops Scheduler workspace.');
  } else {
    console.log(`\n⚠️  Expected 3 rows, found ${verify.length}. Investigate further.`);
  }

  process.exit(0);
}

repair().catch(err => {
  console.error('[REPAIR ERROR]', err);
  process.exit(1);
});
