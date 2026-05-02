'use strict';

const { query, pool } = require('./database');
const logger = require('../utils/logger');

const SQL = `
  CREATE TABLE IF NOT EXISTS activities (
    id            BIGSERIAL PRIMARY KEY,
    platform      TEXT DEFAULT 'facebook_messenger',
    page_id       TEXT,
    sender_psid   TEXT,
    recipient_id  TEXT,
    message_id    TEXT UNIQUE,
    event_type    TEXT,
    text          TEXT,
    raw_payload   JSONB,
    category      TEXT,
    tags          TEXT,
    team          TEXT,
    project       TEXT,
    priority      TEXT,
    ticket_ref    TEXT,
    created_at    TIMESTAMPTZ,
    received_at   TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS message_events (
    id           BIGSERIAL PRIMARY KEY,
    message_id   TEXT,
    sender_psid  TEXT,
    event_type   TEXT,
    raw_payload  JSONB,
    received_at  TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_activities_created_at  ON activities(created_at);
  CREATE INDEX IF NOT EXISTS idx_activities_category    ON activities(category);
  CREATE INDEX IF NOT EXISTS idx_activities_sender_psid ON activities(sender_psid);
  CREATE INDEX IF NOT EXISTS idx_activities_team        ON activities(team);
  CREATE INDEX IF NOT EXISTS idx_activities_project     ON activities(project);
  CREATE INDEX IF NOT EXISTS idx_message_events_received_at ON message_events(received_at);
`;

let migratedPromise = null;

async function migrate() {
  await query(SQL);
  logger.info('Database migrations applied.');
}

function ensureMigrated() {
  if (!migratedPromise) {
    migratedPromise = migrate().catch((err) => {
      logger.error('Migration failed:', err.message);
      migratedPromise = null;
      throw err;
    });
  }
  return migratedPromise;
}

module.exports = { migrate, ensureMigrated };

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(err.message);
      process.exit(1);
    });
}
