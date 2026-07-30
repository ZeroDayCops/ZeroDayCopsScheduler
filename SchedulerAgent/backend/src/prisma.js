const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

try {
  const clientPath = require.resolve('@prisma/client');
  console.log('[PRISMA DEBUG] Cold Start - Resolved @prisma/client engine path:', clientPath);
} catch (e) {
  console.error('[PRISMA DEBUG] Cold Start - Failed resolving @prisma/client:', e.message);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = prisma;

