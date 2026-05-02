'use strict';

const bcrypt = require('bcryptjs');
const { query } = require('../db/database');

async function findByUsername(username) {
  if (!username) return null;
  const r = await query(
    'SELECT username, password_hash, role, allowed_pages FROM admin_users WHERE username = $1',
    [username]
  );
  return r.rows[0] || null;
}

async function listUsers() {
  const r = await query(
    'SELECT username, role, allowed_pages, created_at, updated_at FROM admin_users ORDER BY username ASC'
  );
  return r.rows;
}

async function createUser({ username, password, role = 'user', allowedPages = [] }) {
  if (!username || !password) throw new Error('username and password required');
  if (!['superadmin', 'user'].includes(role)) throw new Error('invalid role');
  const hash = bcrypt.hashSync(password, 12);
  await query(
    `INSERT INTO admin_users (username, password_hash, role, allowed_pages)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role          = EXCLUDED.role,
       allowed_pages = EXCLUDED.allowed_pages,
       updated_at    = now()`,
    [username.trim(), hash, role, JSON.stringify(allowedPages)]
  );
}

async function updateUserAccess({ username, role, allowedPages }) {
  await query(
    `UPDATE admin_users SET role = $2, allowed_pages = $3::jsonb, updated_at = now()
     WHERE username = $1`,
    [username, role, JSON.stringify(allowedPages || [])]
  );
}

async function updatePassword({ username, password }) {
  const hash = bcrypt.hashSync(password, 12);
  await query(
    'UPDATE admin_users SET password_hash = $2, updated_at = now() WHERE username = $1',
    [username, hash]
  );
}

async function deleteUser(username) {
  await query('DELETE FROM admin_users WHERE username = $1', [username]);
}

/**
 * Authenticate against DB first. If no DB users exist yet AND credentials match
 * the env-configured admin, auto-seed that user as superadmin.
 */
async function authenticate(username, password) {
  if (!username || !password) return null;
  const user = await findByUsername(username);
  if (user) {
    if (bcrypt.compareSync(password, user.password_hash)) return user;
    return null;
  }
  // env fallback: only when this username matches and no DB row exists
  const envUser = process.env.ADMIN_USERNAME;
  const envHash = process.env.ADMIN_PASSWORD_HASH;
  if (envUser && envHash && username === envUser && bcrypt.compareSync(password, envHash)) {
    // Seed the DB so they can manage other users immediately.
    await query(
      `INSERT INTO admin_users (username, password_hash, role, allowed_pages)
       VALUES ($1, $2, 'superadmin', '[]'::jsonb)
       ON CONFLICT (username) DO NOTHING`,
      [envUser, envHash]
    );
    return { username: envUser, password_hash: envHash, role: 'superadmin', allowed_pages: [] };
  }
  return null;
}

module.exports = {
  findByUsername,
  listUsers,
  createUser,
  updateUserAccess,
  updatePassword,
  deleteUser,
  authenticate,
};
