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
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
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
const { startScheduler } = require('./services/scheduler');

if (require.main === module || process.env.RENDER) {
  app.listen(PORT, async () => {
    console.log(`SchedulerAgent API backend running on port ${PORT}`);
    
    // Start native 24/7 background scheduler worker
    startScheduler();

    // Seed default templates & permanent user
    try {
      await seedDefaultTemplates();
      await seedPermanentUser();
    } catch (seedErr) {
      console.error('[SEEDER ERROR] Failed to seed default data:', seedErr.message);
    }
  });
}

module.exports = app;
