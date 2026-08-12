const prisma = require('../prisma');

async function seedDefaultTemplates() {
  try {
    console.log('Seeding default templates...');

    const defaults = [
      {
        platform: 'LINKEDIN',
        name: 'LinkedIn Default Template',
        templateBody: '{{headline}}\n\n{{description}}\n\n{{cta}}\n\n{{contactBlock}}\n\n{{hashtags}}',
        isDefault: true,
      },
      {
        platform: 'PINTEREST',
        name: 'Pinterest Default Template',
        templateBody: '{{description}}\n\nFind out more: {{cta}}\n\n{{hashtags}}',
        isDefault: true,
      },
      {
        platform: 'YOUTUBE',
        name: 'YouTube Default Template',
        templateBody: '{{headline}}\n\n{{description}}\n\n{{cta}}\n\n{{contactBlock}}\n\n{{hashtags}}',
        isDefault: true,
      },
      {
        platform: 'GOOGLE_BUSINESS',
        name: 'Google Business Profile Default Template',
        templateBody: '{{headline}}\n\n{{description}}\n\n{{cta}}',
        isDefault: true,
      },
    ];

    for (const item of defaults) {
      await prisma.template.upsert({
        where: {
          id: `default-${item.platform.toLowerCase()}`,
        },
        update: {
          templateBody: item.templateBody,
        },
        create: {
          id: `default-${item.platform.toLowerCase()}`,
          workspaceId: null,
          platform: item.platform,
          name: item.name,
          templateBody: item.templateBody,
          isDefault: true,
        },
      });
    }

    console.log('Default templates seeded successfully.');
  } catch (err) {
    console.error('Failed to seed default templates:', err);
  }
}

module.exports = { seedDefaultTemplates };
