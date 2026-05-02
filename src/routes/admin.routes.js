'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { listPages, upsertPage, deletePage, getAccessToken } = require('../services/pages.service');
const { listSubmissions, DEFAULT_PROFILE } = require('../services/conversation.service');
const { installMessengerProfile } = require('../services/messenger.service');
const { getSenderProfiles } = require('../services/senders.service');
const {
  issueSession,
  clearSession,
  readSession,
  requireAdminSession,
} = require('../middleware/adminSession');

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

// ---------- HTML helpers ------------------------------------------------------

function escapeHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title, body, opts = {}) {
  const nav = opts.hideNav
    ? ''
    : `<nav>
         <a href="/admin/submissions">Submissions</a>
         <a href="/admin/pages">Pages</a>
         <span class="spacer"></span>
         <span class="user">${escapeHtml(opts.user || '')}</span>
         <a href="/admin/logout" class="logout">Logout</a>
       </nav>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} \u00b7 Admin</title>
  <style>
    :root { --bg:#0f172a; --panel:#1e293b; --border:#334155; --text:#e2e8f0; --muted:#94a3b8; --accent:#38bdf8; --danger:#f87171; --ok:#34d399; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }
    nav { display: flex; gap: 16px; padding: 12px 24px; background: var(--panel); border-bottom: 1px solid var(--border); align-items: center; }
    nav a { color: var(--text); text-decoration: none; font-weight: 500; }
    nav a:hover { color: var(--accent); }
    nav .spacer { flex: 1; }
    nav .user { color: var(--muted); font-size: 14px; }
    nav .logout { color: var(--danger); }
    main { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 16px; }
    h2 { margin-top: 32px; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border-radius: 8px; overflow: hidden; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: top; }
    th { background: #0b1220; color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
    tr:last-child td { border-bottom: none; }
    .empty { color: var(--muted); padding: 24px; text-align: center; background: var(--panel); border-radius: 8px; }
    form.card { background: var(--panel); padding: 20px; border-radius: 8px; max-width: 480px; margin: 60px auto; }
    form.inline { display: inline; }
    label { display: block; font-size: 13px; color: var(--muted); margin: 12px 0 4px; }
    input[type=text], input[type=password], textarea {
      width: 100%; padding: 8px 10px; background: #0b1220; color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 14px;
    }
    textarea { font-family: ui-monospace, monospace; min-height: 90px; }
    button {
      margin-top: 16px; padding: 10px 18px; background: var(--accent); color: #0b1220; border: 0; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px;
    }
    button.danger { background: var(--danger); color: #fff; }
    button.secondary { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
    .error { background: #7f1d1d; color: #fee2e2; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; }
    .ok { background: #064e3b; color: #d1fae5; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; background: #0b1220; color: var(--muted); }
    img.thumb { max-width: 64px; max-height: 64px; border-radius: 4px; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
    .sender { display: flex; gap: 8px; align-items: center; }
    .sender-name { font-weight: 500; margin-bottom: 2px; }
    .filters { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .filters input, .filters select { padding: 6px 8px; background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 13px; }
    a.btn { color: var(--accent); text-decoration: none; font-size: 13px; }
    a.btn:hover { text-decoration: underline; }
    code { background: #0b1220; padding: 1px 6px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  ${nav}
  <main>${body}</main>
</body>
</html>`;
}

function flashFromQuery(q) {
  if (q.err) return `<div class="error">${escapeHtml(q.err)}</div>`;
  if (q.ok) return `<div class="ok">${escapeHtml(q.ok)}</div>`;
  return '';
}

// ---------- Public: login / logout -------------------------------------------

router.get('/admin/login', (req, res) => {
  if (readSession(req)) return res.redirect('/admin/submissions');
  const err = req.query.err ? `<div class="error">${escapeHtml(req.query.err)}</div>` : '';
  res.send(
    layout(
      'Login',
      `<form class="card" method="post" action="/admin/login">
         <h1>Admin Login</h1>
         ${err}
         <label>Username</label>
         <input type="text" name="username" autocomplete="username" autofocus required />
         <label>Password</label>
         <input type="password" name="password" autocomplete="current-password" required />
         <button type="submit">Sign in</button>
       </form>`,
      { hideNav: true }
    )
  );
});

router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const expectedUser = process.env.ADMIN_USERNAME;
    const expectedHash = process.env.ADMIN_PASSWORD_HASH;
    if (!expectedUser || !expectedHash) {
      return res.redirect(
        '/admin/login?err=' + encodeURIComponent('Admin credentials not configured (set ADMIN_USERNAME and ADMIN_PASSWORD_HASH).')
      );
    }
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      username !== expectedUser ||
      !bcrypt.compareSync(password, expectedHash)
    ) {
      return res.redirect('/admin/login?err=' + encodeURIComponent('Invalid credentials'));
    }
    issueSession(res, username);
    res.redirect('/admin/submissions');
  } catch (err) {
    res.redirect('/admin/login?err=' + encodeURIComponent(err.message));
  }
});

router.get('/admin/logout', (req, res) => {
  clearSession(res);
  res.redirect('/admin/login');
});

// ---------- Authenticated routes ---------------------------------------------

router.use('/admin', (req, res, next) => {
  // Skip already-public sub-paths.
  if (
    req.path === '/login' ||
    req.path === '/logout'
  ) return next();
  return requireAdminSession(req, res, next);
});

router.get('/admin', (req, res) => res.redirect('/admin/submissions'));

router.get('/admin/submissions', async (req, res, next) => {
  try {
    const { page_id, type } = req.query;
    const data = await listSubmissions({ page_id, type, limit: 200 });
    const pagesList = await listPages();

    // Resolve sender display names (cached, with weekly refresh).
    const senderMap = await getSenderProfiles(
      data.items.map((s) => ({ pageId: s.page_id, psid: s.sender_psid }))
    );
    const pageOptions = ['<option value="">All pages</option>']
      .concat(
        pagesList.map(
          (p) =>
            `<option value="${escapeHtml(p.page_id)}"${
              p.page_id === page_id ? ' selected' : ''
            }>${escapeHtml(p.page_name || p.page_id)}</option>`
        )
      )
      .join('');
    const typeOptions = ['', 'Home Church', 'Cell Group']
      .map(
        (t) =>
          `<option value="${escapeHtml(t)}"${t === (type || '') ? ' selected' : ''}>${
            t || 'All types'
          }</option>`
      )
      .join('');

    const rows = data.items
      .map((s) => {
        const prof = senderMap.get(`${s.page_id}:${s.sender_psid}`) || {};
        const name = prof.name || '(unknown)';
        const avatar = prof.profile_pic
          ? `<img class="avatar" src="${escapeHtml(prof.profile_pic)}" alt=""/>`
          : '';
        return `<tr>
          <td>#${s.id}</td>
          <td>${escapeHtml(s.type)}</td>
          <td>${escapeHtml(s.area || '—')}</td>
          <td>${escapeHtml(s.details)}</td>
          <td>${escapeHtml(s.location)}</td>
          <td>${escapeHtml(s.attendees)}</td>
          <td>${
            s.image_url
              ? `<a href="${escapeHtml(s.image_url)}" target="_blank"><img class="thumb" src="${escapeHtml(s.image_url)}" alt="img"/></a>`
              : '<span class="pill">none</span>'
          }</td>
          <td>
            <div class="sender">${avatar}<div>
              <div class="sender-name">${escapeHtml(name)}</div>
              <span class="pill" title="PSID">${escapeHtml(s.sender_psid)}</span>
            </div></div>
          </td>
          <td>${escapeHtml(new Date(s.created_at).toLocaleString())}</td>
        </tr>`;
      })
      .join('');

    const body = `
      <h1>Submissions <span class="pill">${data.total}</span></h1>
      ${flashFromQuery(req.query)}
      <form class="filters" method="get">
        <select name="page_id">${pageOptions}</select>
        <select name="type">${typeOptions}</select>
        <button type="submit" class="secondary">Filter</button>
        <a class="btn" href="/admin/submissions">Reset</a>
      </form>
      ${
        data.items.length === 0
          ? '<div class="empty">No submissions yet.</div>'
          : `<table>
              <thead><tr>
                <th>ID</th><th>Type</th><th>Area</th><th>Details</th><th>Location</th><th>Attendees</th><th>Image</th><th>Sender</th><th>Created</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>`
      }`;
    res.send(layout('Submissions', body, { user: req.adminSession.username }));
  } catch (err) {
    next(err);
  }
});

router.get('/admin/pages', async (req, res, next) => {
  try {
    const pages = await listPages();
    const rows = pages.length
      ? pages
          .map(
            (p) => `<tr>
              <td><span class="pill">${escapeHtml(p.page_id)}</span></td>
              <td>${escapeHtml(p.page_name)}</td>
              <td>${escapeHtml(new Date(p.updated_at).toLocaleString())}</td>
              <td>
                <form class="inline" method="post" action="/admin/pages/${escapeHtml(p.page_id)}/profile">
                  <button type="submit" class="secondary">Install Get Started</button>
                </form>
                <form class="inline" method="post" action="/admin/pages/${escapeHtml(p.page_id)}/delete" onsubmit="return confirm('Delete this page?');">
                  <button type="submit" class="danger">Delete</button>
                </form>
              </td>
            </tr>`
          )
          .join('')
      : '';
    const body = `
      <h1>Pages</h1>
      ${flashFromQuery(req.query)}
      ${
        pages.length
          ? `<table>
              <thead><tr><th>Page ID</th><th>Name</th><th>Updated</th><th>Actions</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`
          : '<div class="empty">No pages registered.</div>'
      }
      <h2>Add / update a page</h2>
      <form class="card" method="post" action="/admin/pages" style="margin: 16px 0; max-width: 600px;">
        <label>Page ID</label>
        <input type="text" name="page_id" required />
        <label>Page name</label>
        <input type="text" name="page_name" />
        <label>Page access token</label>
        <textarea name="page_access_token" required placeholder="EAA..."></textarea>
        <button type="submit">Save</button>
      </form>`;
    res.send(layout('Pages', body, { user: req.adminSession.username }));
  } catch (err) {
    next(err);
  }
});

router.post('/admin/pages', async (req, res, next) => {
  try {
    const { page_id, page_name, page_access_token } = req.body || {};
    if (!page_id || !page_access_token) {
      return res.redirect('/admin/pages?err=' + encodeURIComponent('page_id and page_access_token required'));
    }
    await upsertPage({ pageId: String(page_id).trim(), pageName: page_name || null, accessToken: page_access_token.trim() });
    res.redirect('/admin/pages?ok=' + encodeURIComponent('Page saved'));
  } catch (err) {
    next(err);
  }
});

router.post('/admin/pages/:pageId/delete', async (req, res, next) => {
  try {
    await deletePage(req.params.pageId);
    res.redirect('/admin/pages?ok=' + encodeURIComponent('Page deleted'));
  } catch (err) {
    next(err);
  }
});

router.post('/admin/pages/:pageId/profile', async (req, res, next) => {
  try {
    const accessToken = await getAccessToken(req.params.pageId);
    if (!accessToken) {
      return res.redirect('/admin/pages?err=' + encodeURIComponent('Page not found'));
    }
    const result = await installMessengerProfile(DEFAULT_PROFILE, { accessToken });
    if (!result.ok) {
      return res.redirect('/admin/pages?err=' + encodeURIComponent('Install failed: ' + result.error));
    }
    res.redirect('/admin/pages?ok=' + encodeURIComponent('Get Started installed'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
