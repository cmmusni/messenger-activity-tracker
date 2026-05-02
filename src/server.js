'use strict';

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');

const server = app.listen(config.port, () => {
  logger.info(`Activity Tracker listening on port ${config.port} (${config.nodeEnv})`);
});

function shutdown(signal) {
  logger.info(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => logger.error('unhandledRejection:', reason));
process.on('uncaughtException', (err) => logger.error('uncaughtException:', err.message));

module.exports = server;
