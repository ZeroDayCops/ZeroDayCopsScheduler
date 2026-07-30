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

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

const { initWatcher } = require('./services/watcher');
const { seedDefaultTemplates } = require('./services/template-seeder');
const { seedPermanentUser } = require('./services/user-seeder');
const { startScheduler } = require('./services/scheduler');

app.listen(PORT, async () => {
  console.log(`SchedulerAgent backend running on http://localhost:${PORT}`);
  console.log('LinkedIn secret loaded:', !!process.env.LINKEDIN_CLIENT_SECRET, 'length:', process.env.LINKEDIN_CLIENT_SECRET?.length);
  // Seed default templates & permanent user
  await seedDefaultTemplates();
  await seedPermanentUser();
  // Start directory watcher
  initWatcher();
  // Start post scheduler cron
  startScheduler();
});

module.exports = app;
