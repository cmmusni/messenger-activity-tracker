'use strict';

const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error('Unhandled error:', err && err.message ? err.message : err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({
    error: err.publicMessage || 'Internal Server Error',
  });
}

module.exports = { errorHandler };
