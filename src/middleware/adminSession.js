'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'admin_session';
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function getSecret() {
  return (
    process.env.SESSION_SECRET ||
    process.env.ADMIN_API_KEY || // fallback so it still works if SESSION_SECRET is unset
    'change-me-please-change-me-please'
  );
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

function timingSafeEq(a, b) {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function issueSession(res, username, ttlSec = DEFAULT_TTL_SEC) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${username}.${exp}`;
  const sig = sign(payload);
  const value = `${payload}.${sig}`;
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ttlSec * 1000,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function readSession(req) {
  const raw = req.cookies && req.cookies[COOKIE_NAME];
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [username, expStr, sig] = parts;
  const expected = sign(`${username}.${expStr}`);
  if (!timingSafeEq(sig, expected)) return null;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return { username, exp };
}

/**
 * Express middleware: requires a valid session cookie. Redirects to /admin/login
 * for HTML clients, otherwise responds 401.
 */
function requireAdminSession(req, res, next) {
  const sess = readSession(req);
  if (sess) {
    req.adminSession = sess;
    return next();
  }
  if ((req.headers.accept || '').includes('text/html')) {
    return res.redirect('/admin/login');
  }
  res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { issueSession, clearSession, readSession, requireAdminSession };
