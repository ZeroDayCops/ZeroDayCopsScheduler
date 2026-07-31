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

router.get('/cron/process-due-posts', async (_req, res) => {
  try {
    console.log('[CRON] Triggering scheduled post processing via Vercel Cron...');
    const result = await processDuePosts();
    res.status(200).json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[CRON ERROR]:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
