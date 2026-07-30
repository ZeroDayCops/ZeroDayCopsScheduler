require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('./prisma');

async function seed() {
  console.log('Seeding user account: bothubey...');

  const passwordHash = await bcrypt.hash('bothubey', 10);

  // 1. Create or update user
  const user = await prisma.user.upsert({
    where: { email: 'bothubey@gmail.com' },
    update: {
      passwordHash,
      name: 'B1t3x0p (bothubey)',
    },
    create: {
      email: 'bothubey@gmail.com',
      passwordHash,
      name: 'B1t3x0p (bothubey)',
    },
  });

  console.log(`User created/updated: ${user.id} (${user.email})`);

  // 2. Create organization if not exists
  let org = await prisma.organization.findFirst({
    where: { name: 'Bothubey Agency' },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Bothubey Agency',
      },
    });
    console.log(`Organization created: ${org.id}`);
  }

  // 3. Ensure membership
  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: org.id,
      },
    },
    update: { role: 'OWNER' },
    create: {
      userId: user.id,
      organizationId: org.id,
      role: 'OWNER',
    },
  });

  // 4. Create default workspace if not exists
  let ws = await prisma.workspace.findFirst({
    where: { organizationId: org.id },
  });

  if (!ws) {
    ws = await prisma.workspace.create({
      data: {
        organizationId: org.id,
        brandName: 'Bothubey Primary Workspace',
        website: 'https://bothubey.agency',
        cta: 'Check out our latest stories!',
        defaultHashtags: ['#bothubey', '#zero_day_cops', '#scheduler'],
        brandVoice: 'Bold, adventurous, creative',
        emojiStyle: 'moderate',
        automationMode: 'MANUAL',
        defaultSlotTime: '10:00',
      },
    });

    // Create 3 social accounts
    const platforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
    await prisma.socialAccount.createMany({
      data: platforms.map(platform => ({
        workspaceId: ws.id,
        platform,
        status: 'NOT_CONNECTED',
      })),
    });

    // Grant access
    await prisma.workspaceAccess.create({
      data: {
        userId: user.id,
        workspaceId: ws.id,
      },
    });

    console.log(`Workspace created: ${ws.id}`);
  }

  console.log('Seeding complete! You can now log in with:');
  console.log('  Email: bothubey@gmail.com');
  console.log('  Password: bothubey');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
