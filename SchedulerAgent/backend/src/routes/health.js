const express = require('express');
const prisma = require('../prisma');
const { getSchedulerLastRunAt } = require('../services/scheduler');

const router = express.Router();

router.get('/health', async (_req, res) => {
  let dbStatus = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (dbErr) {
    console.error('[HEALTH] Database connection check failed:', dbErr.message);
    dbStatus = 'error';
  }

  const isHealthy = dbStatus === 'ok';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    database: dbStatus,
    service: 'SchedulerAgent',
    timestamp: new Date().toISOString(),
    schedulerLastRunAt: getSchedulerLastRunAt(),
  });
});

module.exports = router;
