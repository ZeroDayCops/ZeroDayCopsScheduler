const express = require('express');
const { processDuePosts } = require('../services/scheduler');
const router = express.Router();

router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'SchedulerAgent',
    timestamp: new Date().toISOString(),
  });
});

const handleCronProcessDuePosts = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET || 'zerodaycops_cron_secret_2026_x99';
  const authHeader = req.headers['authorization'];
  const customHeader = req.headers['x-internal-cron-secret'] || req.headers['x-cron-secret'];
  
  let authorized = false;
  let triggerSource = 'UNAUTHORIZED';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === cronSecret) {
      authorized = true;
      triggerSource = 'VERCEL_CRON_BEARER';
    }
  }

  if (!authorized && customHeader && customHeader.trim() === cronSecret) {
    authorized = true;
    triggerSource = 'SUPABASE_PG_NET';
  }

  if (!authorized) {
    console.warn(`[CRON INVOCATION REJECTED 401] Method: ${req.method} | IP: ${req.ip} | Missing or invalid cron secret.`);
    return res.status(401).json({ error: 'Unauthorized: Invalid cron secret' });
  }

  try {
    console.log(`[CRON INVOCATION BEGIN] Trigger Source: ${triggerSource} | Time: ${new Date().toISOString()}`);
    const claimedCount = await processDuePosts();
    console.log(`[CRON INVOCATION COMPLETE] Trigger Source: ${triggerSource} | Claimed & Processed: ${claimedCount || 0} posts | Status: SUCCESS`);
    res.status(200).json({
      success: true,
      triggerSource,
      claimedCount: claimedCount || 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[CRON INVOCATION FAILED] Trigger Source: ${triggerSource} | Error:`, err.message);
    res.status(500).json({ error: err.message, triggerSource });
  }
};

router.get('/cron/process-due-posts', handleCronProcessDuePosts);
router.post('/cron/process-due-posts', handleCronProcessDuePosts);

module.exports = router;
