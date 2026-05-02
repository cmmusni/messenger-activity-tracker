'use strict';

const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

if (!config.databaseUrl) {
  logger.error('DATABASE_URL is not set. Postgres connection cannot be established.');
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  logger.error('Postgres pool error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
