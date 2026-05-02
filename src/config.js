'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  verifyToken: process.env.VERIFY_TOKEN || '',
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN || '',
  appSecret: process.env.APP_SECRET || '',
  graphApiVersion: process.env.GRAPH_API_VERSION || 'v21.0',
  enableAutoReply: String(process.env.ENABLE_AUTO_REPLY || 'false').toLowerCase() === 'true',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  databaseUrl: process.env.DATABASE_URL || '',
  pgSsl: String(process.env.PGSSL || 'false').toLowerCase() === 'true',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

config.isProduction = config.nodeEnv === 'production';

module.exports = config;
