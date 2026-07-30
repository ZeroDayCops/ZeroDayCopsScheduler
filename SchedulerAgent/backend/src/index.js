require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const workspacesRouter = require('./routes/workspaces');
const organizationsRouter = require('./routes/organizations');
const mediaRouter = require('./routes/media');
const postsRouter = require('./routes/posts');
const oauthRouter = require('./routes/oauth');
const notificationsRouter = require('./routes/notifications');
const analyticsRouter = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  'https://scheduler.zerodaycops.in',
  'http://scheduler.zerodaycops.in',
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/organizations/:orgId', organizationsRouter);
app.use('/api/media', mediaRouter);
app.use('/api/workspaces/:workspaceId', postsRouter);
app.use('/api/workspaces/:workspaceId/analytics', analyticsRouter);
app.use('/api/oauth', oauthRouter);
app.use('/api/workspaces', notificationsRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const { seedDefaultTemplates } = require('./services/template-seeder');
const { seedPermanentUser } = require('./services/user-seeder');

// Log background worker state on entrypoint load (Vercel cold start or server init)
const enableWorkers = process.env.RUN_BACKGROUND_WORKERS === 'true';
console.log(`[WORKER SYSTEM] Environment check: RUN_BACKGROUND_WORKERS=${process.env.RUN_BACKGROUND_WORKERS || 'unset'}. Background workers (Chokidar watcher & Node-Cron scheduler) are ${enableWorkers ? 'ENABLED' : 'DISABLED'}.`);

function runWorkersIfEnabled() {
  if (process.env.RUN_BACKGROUND_WORKERS === 'true') {
    console.log('[WORKER SYSTEM] RUN_BACKGROUND_WORKERS=true -> Initializing background workers (Chokidar + Node-Cron)...');
    try {
      const { initWatcher } = require('./services/watcher');
      initWatcher();
    } catch (watcherErr) {
      console.error('[WATCHER ERROR] Failed to start chokidar watcher:', watcherErr.message);
    }
    try {
      const { startScheduler } = require('./services/scheduler');
      startScheduler();
    } catch (schedErr) {
      console.error('[SCHEDULER ERROR] Failed to start cron scheduler:', schedErr.message);
    }
  }
}


if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`SchedulerAgent backend running on port ${PORT}`);
    
    // Seed default templates & permanent user
    try {
      await seedDefaultTemplates();
      await seedPermanentUser();
    } catch (seedErr) {
      console.error('[SEEDER ERROR] Failed to seed default data:', seedErr.message);
    }

    // Background workers gate (Disabled on Vercel serverless, enabled on persistent worker servers)
    runWorkersIfEnabled();
  });
}



module.exports = app;
