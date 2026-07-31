const bcrypt = require('bcrypt');
const prisma = require('../prisma');

const PERMANENT_USER_EMAIL = 'bothubey@gmail.com';
const PERMANENT_USER_PASSWORD = 'bothubey';
const SALT_ROUNDS = 12;
const REQUIRED_PLATFORMS = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];

/**
 * Self-healing: ensures every workspace has all 3 SocialAccount placeholder rows.
 * Runs on every boot so this class of bug can never recur.
 */
async function repairMissingSocialAccounts() {
  const workspaces = await prisma.workspace.findMany({
    include: { socialAccounts: true },
  });

  for (const ws of workspaces) {
    const existingPlatforms = new Set(ws.socialAccounts.map(sa => sa.platform));
    const missing = REQUIRED_PLATFORMS.filter(p => !existingPlatforms.has(p));

    if (missing.length > 0) {
      await prisma.socialAccount.createMany({
        data: missing.map(platform => ({
          workspaceId: ws.id,
          platform,
          status: 'NOT_CONNECTED',
        })),
      });
      console.log(`[SEEDER] Repaired workspace "${ws.brandName}" — inserted ${missing.length} missing SocialAccount row(s): ${missing.join(', ')}`);
    }
  }

  // One-time data repair for stuck media row
  try {
    const stuckRow = await prisma.media.findUnique({
      where: { id: '7b179ddc-d79f-49bd-a9a1-7daf0f88f7e3' },
    });
    if (stuckRow && stuckRow.status === 'ANALYZING') {
      await prisma.media.update({
        where: { id: '7b179ddc-d79f-49bd-a9a1-7daf0f88f7e3' },
        data: {
          status: 'FAILED',
          statusDetail: null,
          aiMasterJson: { error: 'Media analysis processing timed out (reconciled).' },
        },
      });
      console.log('[SEEDER REPAIR] Repaired stuck video media row 7b179ddc-d79f-49bd-a9a1-7daf0f88f7e3 -> FAILED.');
    }
  } catch (repairErr) {
    console.warn('[SEEDER REPAIR WARN]:', repairErr.message);
  }
}

async function seedPermanentUser() {
  try {
    const existing = await prisma.user.findUnique({
      where: { email: PERMANENT_USER_EMAIL },
      include: {
        memberships: {
          include: { organization: true },
        },
        workspaceAccess: {
          include: { workspace: true },
        },
      },
    });

    const passwordHash = await bcrypt.hash(PERMANENT_USER_PASSWORD, SALT_ROUNDS);

    if (existing) {
      console.log(`[SEEDER] Permanent account ${PERMANENT_USER_EMAIL} verified (existing user untouched).`);

      // Self-heal: repair any workspaces missing SocialAccount rows (CREATE-ONLY)
      await repairMissingSocialAccounts();
      return;
    }

    // Create organization, user, membership, workspace, AND social accounts in transaction
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: 'ZeroDayCops Org' },
      });

      const user = await tx.user.create({
        data: {
          email: PERMANENT_USER_EMAIL,
          passwordHash,
          name: 'B1t3x0p',
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: 'OWNER',
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          organizationId: org.id,
          brandName: 'ZeroDayCops Scheduler',
          website: 'https://zerodaycops.com',
          cta: 'Automate your social calendar',
          defaultHashtags: ['#zerodaycops', '#automation', '#scheduler'],
          brandVoice: 'Bold & Precise',
          emojiStyle: 'selective',
        },
      });

      // Create 3 NOT_CONNECTED SocialAccount placeholders (matches POST /api/workspaces behavior)
      await tx.socialAccount.createMany({
        data: REQUIRED_PLATFORMS.map(platform => ({
          workspaceId: workspace.id,
          platform,
          status: 'NOT_CONNECTED',
        })),
      });

      await tx.workspaceAccess.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
        },
      });
    });

    console.log(`[SEEDER] Permanent master account ${PERMANENT_USER_EMAIL} created successfully!`);
  } catch (err) {
    console.error('[SEEDER ERROR] Failed to seed permanent user:', err);
  }
}

module.exports = { seedPermanentUser, PERMANENT_USER_EMAIL };
