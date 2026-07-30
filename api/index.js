try {
  require('../SchedulerAgent/backend/node_modules/.prisma/client/default.js');
} catch (e) {}
try {
  require('../SchedulerAgent/backend/node_modules/.prisma/client/index.js');
} catch (e) {}

const app = require('../SchedulerAgent/backend/src/index.js');

module.exports = app;

