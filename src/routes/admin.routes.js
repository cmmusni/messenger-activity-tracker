'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { listPages, upsertPage, deletePage, getAccessToken } = require('../services/pages.service');
const { listSubmissions, getReportsData, DEFAULT_PROFILE } = require('../services/conversation.service');
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

function escapeHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
:root {
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;
  --card: 240 6% 10%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 6% 10%;
  --secondary: 240 4% 16%;
  --secondary-foreground: 0 0% 98%;
  --muted-foreground: 240 5% 65%;
  --accent: 240 4% 16%;
  --destructive: 0 63% 31%;
  --destructive-foreground: 0 0% 98%;
  --success: 142 71% 45%;
  --border: 240 4% 16%;
  --input: 240 4% 16%;
  --ring: 240 5% 65%;
  --radius: 0.5rem;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
.app { min-height: 100vh; display: flex; flex-direction: column; }
.topbar {
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  position: sticky; top: 0; z-index: 50;
}
.topbar-inner {
  max-width: 1200px; margin: 0 auto; padding: 0 24px;
  display: flex; align-items: center; height: 56px; gap: 24px;
}
.brand { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
.brand .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: hsl(var(--success)); margin-right: 8px; vertical-align: middle; }
.nav-links { display: flex; gap: 4px; flex: 1; }
.nav-links a {
  padding: 6px 12px; border-radius: var(--radius); font-weight: 500; font-size: 14px;
  color: hsl(var(--muted-foreground));
  transition: color 0.15s, background 0.15s;
}
.nav-links a:hover, .nav-links a.active { color: hsl(var(--foreground)); background: hsl(var(--accent)); }
.user-menu { display: flex; align-items: center; gap: 12px; font-size: 13px; color: hsl(var(--muted-foreground)); }
main.container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; flex: 1; width: 100%; }

h1.page-title { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 4px; }
.page-subtitle { color: hsl(var(--muted-foreground)); font-size: 14px; margin: 0; }
h2.section-title { font-size: 18px; font-weight: 600; margin: 32px 0 12px; letter-spacing: -0.01em; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }

.card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  overflow: hidden;
}
.card-header { padding: 20px 24px 12px; }
.card-title { font-size: 16px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.01em; }
.card-description { color: hsl(var(--muted-foreground)); font-size: 13px; margin: 0; }
.card-content { padding: 16px 24px 20px; }
.card-footer { padding: 12px 24px 20px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid hsl(var(--border)); background: hsl(var(--background) / 0.4); }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 36px; padding: 0 16px; border-radius: var(--radius);
  font-size: 14px; font-weight: 500; cursor: pointer; border: 1px solid transparent;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap; text-decoration: none; font-family: inherit;
}
.btn-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.btn-primary:hover { opacity: 0.9; }
.btn-outline { background: transparent; color: hsl(var(--foreground)); border-color: hsl(var(--border)); }
.btn-outline:hover { background: hsl(var(--accent)); }
.btn-destructive { background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); }
.btn-destructive:hover { opacity: 0.9; }
.btn-ghost { background: transparent; color: hsl(var(--muted-foreground)); }
.btn-ghost:hover { color: hsl(var(--foreground)); background: hsl(var(--accent)); }
.btn-sm { height: 32px; padding: 0 12px; font-size: 13px; }
.btn:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }

.form-row { margin-bottom: 16px; }
.label { display: block; font-size: 13px; font-weight: 500; color: hsl(var(--foreground)); margin-bottom: 6px; }
.input, .select, .textarea {
  display: block; width: 100%; height: 36px; padding: 0 12px;
  background: hsl(var(--background)); color: hsl(var(--foreground));
  border: 1px solid hsl(var(--input)); border-radius: var(--radius);
  font-size: 14px; font-family: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input:focus, .select:focus, .textarea:focus {
  outline: none; border-color: hsl(var(--ring));
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.2);
}
.textarea { height: auto; min-height: 96px; padding: 10px 12px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; resize: vertical; }
.select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2398a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 32px; }

.filters {
  display: flex; gap: 8px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;
  padding: 12px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius);
}
.filters .select, .filters .input { width: auto; min-width: 160px; height: 32px; }

.table-wrap { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius); overflow: hidden; }
table.table { width: 100%; border-collapse: collapse; font-size: 13px; }
table.table th {
  background: hsl(var(--card)); padding: 10px 16px; text-align: left;
  font-weight: 500; font-size: 12px; color: hsl(var(--muted-foreground));
  border-bottom: 1px solid hsl(var(--border)); white-space: nowrap;
}
table.table td {
  padding: 12px 16px; border-bottom: 1px solid hsl(var(--border));
  vertical-align: top; color: hsl(var(--foreground));
}
table.table tr:last-child td { border-bottom: none; }
table.table tr:hover td { background: hsl(var(--accent) / 0.4); }
.cell-mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; color: hsl(var(--muted-foreground)); white-space: nowrap; }
.cell-id { color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }
.muted { color: hsl(var(--muted-foreground)); }

.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; height: 20px; border-radius: 999px;
  font-size: 11px; font-weight: 500;
  border: 1px solid hsl(var(--border));
  background: transparent; color: hsl(var(--muted-foreground));
  white-space: nowrap;
}
.badge-secondary { background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); border-color: transparent; }
.badge-mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; }

.avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 50%;
  background: hsl(var(--secondary)); color: hsl(var(--muted-foreground));
  font-size: 12px; font-weight: 600; overflow: hidden; flex-shrink: 0;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.sender-cell { display: flex; align-items: center; gap: 10px; min-width: 180px; }
.sender-name { font-weight: 500; color: hsl(var(--foreground)); }
.sender-psid { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; color: hsl(var(--muted-foreground)); }

.thumb { width: 56px; height: 56px; border-radius: 6px; object-fit: cover; border: 1px solid hsl(var(--border)); display: block; }

.alert {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; border-radius: var(--radius);
  border: 1px solid hsl(var(--border)); background: hsl(var(--card));
  margin-bottom: 16px; font-size: 14px;
}
.alert-icon { flex-shrink: 0; width: 16px; height: 16px; margin-top: 2px; }
.alert-error { border-color: hsl(var(--destructive) / 0.5); background: hsl(var(--destructive) / 0.1); color: hsl(0 0% 95%); }
.alert-success { border-color: hsl(var(--success) / 0.4); background: hsl(var(--success) / 0.1); color: hsl(var(--success)); }

.empty {
  text-align: center; padding: 48px 24px; color: hsl(var(--muted-foreground));
  background: hsl(var(--card)); border: 1px dashed hsl(var(--border)); border-radius: var(--radius);
  font-size: 14px;
}

.auth-shell { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: hsl(var(--background)); }
.auth-card { width: 100%; max-width: 380px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius); padding: 28px; }
.auth-card h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
.auth-card .auth-sub { color: hsl(var(--muted-foreground)); font-size: 13px; margin: 0 0 24px; }

.inline-form { display: inline; }
.row-actions { display: flex; gap: 6px; justify-content: flex-end; }

.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat-card { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius); padding: 20px; }
.stat-label { color: hsl(var(--muted-foreground)); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px; }
.stat-value { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; margin: 0; font-variant-numeric: tabular-nums; }
.stat-sub { color: hsl(var(--muted-foreground)); font-size: 12px; margin: 4px 0 0; }
.charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 900px) { .charts-grid { grid-template-columns: 1fr; } }
.chart-box { position: relative; height: 280px; padding: 12px 4px 4px; }
`;

function layout(title, body, opts = {}) {
  const user = opts.user || '';
  const initials = user
    ? user.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    : '';
  const active = opts.active || '';
  const navLinks = `
    <a href="/admin/submissions" class="${active === 'submissions' ? 'active' : ''}">Submissions</a>
    <a href="/admin/reports" class="${active === 'reports' ? 'active' : ''}">Reports</a>
    <a href="/admin/pages" class="${active === 'pages' ? 'active' : ''}">Pages</a>
  `;
  const topbar = opts.hideNav
    ? ''
    : `<header class="topbar">
         <div class="topbar-inner">
           <div class="brand"><span class="dot"></span>Activity Tracker</div>
           <nav class="nav-links">${navLinks}</nav>
           <div class="user-menu">
             <div class="avatar" title="${escapeHtml(user)}">${escapeHtml(initials || '?')}</div>
             <a href="/admin/logout" class="btn btn-ghost btn-sm">Sign out</a>
           </div>
         </div>
       </header>`;
  const main = opts.hideNav ? body : `<main class="container">${body}</main>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(title)} \u00b7 Admin</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="app">
    ${topbar}
    ${main}
  </div>
</body>
</html>`;
}

function flashFromQuery(q) {
  if (q.err) {
    return `<div class="alert alert-error">
      <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>${escapeHtml(q.err)}</div>
    </div>`;
  }
  if (q.ok) {
    return `<div class="alert alert-success">
      <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <div>${escapeHtml(q.ok)}</div>
    </div>`;
  }
  return '';
}

// ---------- Public: login / logout -------------------------------------------

router.get('/admin/login', (req, res) => {
  if (readSession(req)) return res.redirect('/admin/submissions');
  const errAlert = req.query.err
    ? `<div class="alert alert-error">
         <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
         <div>${escapeHtml(req.query.err)}</div>
       </div>`
    : '';
  res.send(
    layout(
      'Sign in',
      `<div class="auth-shell">
         <form class="auth-card" method="post" action="/admin/login">
           <h1>Sign in</h1>
           <p class="auth-sub">Enter your credentials to access the admin dashboard.</p>
           ${errAlert}
           <div class="form-row">
             <label class="label" for="username">Username</label>
             <input class="input" id="username" type="text" name="username" autocomplete="username" autofocus required />
           </div>
           <div class="form-row">
             <label class="label" for="password">Password</label>
             <input class="input" id="password" type="password" name="password" autocomplete="current-password" required />
           </div>
           <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">Sign in</button>
         </form>
       </div>`,
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
  if (req.path === '/login' || req.path === '/logout') return next();
  return requireAdminSession(req, res, next);
});

router.get('/admin', (req, res) => res.redirect('/admin/submissions'));

router.get('/admin/submissions', async (req, res, next) => {
  try {
    const { page_id, type } = req.query;
    const data = await listSubmissions({ page_id, type, limit: 200 });
    const pagesList = await listPages();

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
        const name = prof.name || 'Unknown';
        const initials = (prof.name || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
        const avatar = prof.profile_pic
          ? `<div class="avatar"><img src="${escapeHtml(prof.profile_pic)}" alt=""/></div>`
          : `<div class="avatar">${escapeHtml(initials)}</div>`;
        return `<tr>
          <td class="cell-id">#${s.id}</td>
          <td><span class="badge badge-secondary">${escapeHtml(s.type)}</span></td>
          <td>${s.area ? `<span class="badge">${escapeHtml(s.area)}</span>` : '<span class="muted">—</span>'}</td>
          <td>${escapeHtml(s.details)}</td>
          <td>${escapeHtml(s.location)}</td>
          <td style="font-variant-numeric: tabular-nums;">${escapeHtml(s.attendees)}</td>
          <td>${
            s.image_url
              ? `<a href="${escapeHtml(s.image_url)}" target="_blank"><img class="thumb" src="${escapeHtml(s.image_url)}" alt="img"/></a>`
              : '<span class="muted" style="font-size:12px;">—</span>'
          }</td>
          <td>
            <div class="sender-cell">
              ${avatar}
              <div>
                <div class="sender-name">${escapeHtml(name)}</div>
                <div class="sender-psid">${escapeHtml(s.sender_psid)}</div>
              </div>
            </div>
          </td>
          <td class="cell-mono">${escapeHtml(new Date(s.created_at).toLocaleString())}</td>
        </tr>`;
      })
      .join('');

    const body = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Submissions</h1>
          <p class="page-subtitle">${data.total} total ${data.total === 1 ? 'record' : 'records'}</p>
        </div>
      </div>
      ${flashFromQuery(req.query)}
      <form class="filters" method="get">
        <select class="select" name="page_id">${pageOptions}</select>
        <select class="select" name="type">${typeOptions}</select>
        <button type="submit" class="btn btn-outline btn-sm">Apply filters</button>
        <a href="/admin/submissions" class="btn btn-ghost btn-sm">Reset</a>
      </form>
      ${
        data.items.length === 0
          ? '<div class="empty">No submissions yet. Records will appear here when users complete the Record Activity flow.</div>'
          : `<div class="table-wrap"><table class="table">
              <thead><tr>
                <th>ID</th><th>Type</th><th>Area</th><th>Details</th><th>Location</th><th>Attendees</th><th>Photo</th><th>Sender</th><th>Created</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table></div>`
      }`;
    res.send(layout('Submissions', body, { user: req.adminSession.username, active: 'submissions' }));
  } catch (err) {
    next(err);
  }
});

router.get('/admin/reports', async (req, res, next) => {
  try {
    const { page_id, days } = req.query;
    const d = parseInt(days, 10) || 30;
    const data = await getReportsData({ page_id, days: d });
    const pagesList = await listPages();

    const senderMap = await getSenderProfiles(
      data.topSenders.map((s) => ({ pageId: s.page_id, psid: s.sender_psid }))
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
    const dayOptions = [7, 30, 90, 180, 365]
      .map(
        (n) =>
          `<option value="${n}"${n === d ? ' selected' : ''}>Last ${n} days</option>`
      )
      .join('');

    const topSendersRows = data.topSenders.length
      ? data.topSenders
          .map((s) => {
            const prof = senderMap.get(`${s.page_id}:${s.sender_psid}`) || {};
            const name = prof.name || 'Unknown';
            const initials = (prof.name || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
            const avatar = prof.profile_pic
              ? `<div class="avatar"><img src="${escapeHtml(prof.profile_pic)}" alt=""/></div>`
              : `<div class="avatar">${escapeHtml(initials)}</div>`;
            return `<tr>
              <td><div class="sender-cell">${avatar}<div><div class="sender-name">${escapeHtml(name)}</div><div class="sender-psid">${escapeHtml(s.sender_psid)}</div></div></div></td>
              <td style="text-align:right;font-variant-numeric:tabular-nums;"><strong>${s.count}</strong></td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="2" class="muted" style="text-align:center;padding:24px;">No data</td></tr>';

    const chartData = {
      byDay: data.byDay,
      byType: data.byType,
      byArea: data.byArea,
    };

    const body = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Reports</h1>
          <p class="page-subtitle">Activity overview for the last ${d} days.</p>
        </div>
      </div>
      <form class="filters" method="get">
        <select class="select" name="page_id">${pageOptions}</select>
        <select class="select" name="days">${dayOptions}</select>
        <button type="submit" class="btn btn-outline btn-sm">Apply</button>
        <a href="/admin/reports" class="btn btn-ghost btn-sm">Reset</a>
      </form>

      <div class="stats-grid">
        <div class="stat-card">
          <p class="stat-label">Total submissions</p>
          <p class="stat-value">${data.totals.total_submissions}</p>
          <p class="stat-sub">in the last ${d} days</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Total attendees</p>
          <p class="stat-value">${data.totals.total_attendees}</p>
          <p class="stat-sub">summed across activities</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Unique senders</p>
          <p class="stat-value">${data.totals.unique_senders}</p>
          <p class="stat-sub">distinct PSIDs</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Avg per day</p>
          <p class="stat-value">${(data.totals.total_submissions / d).toFixed(1)}</p>
          <p class="stat-sub">submissions / day</p>
        </div>
      </div>

      <div class="charts-grid">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Submissions over time</h3>
            <p class="card-description">Daily breakdown by type</p>
          </div>
          <div class="card-content"><div id="chartTime" class="chart-box"></div></div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">By type</h3>
            <p class="card-description">Distribution of activity types</p>
          </div>
          <div class="card-content"><div id="chartType" class="chart-box"></div></div>
        </div>
      </div>

      <div class="charts-grid" style="grid-template-columns: 1fr 1fr;">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">By area</h3>
            <p class="card-description">Submissions per area</p>
          </div>
          <div class="card-content"><div id="chartArea" class="chart-box"></div></div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Top contributors</h3>
            <p class="card-description">Most active senders</p>
          </div>
          <div class="card-content" style="padding: 0 24px 12px;">
            <table class="table" style="background: transparent;">
              <thead><tr><th>Sender</th><th style="text-align:right;">Submissions</th></tr></thead>
              <tbody>${topSendersRows}</tbody>
            </table>
          </div>
        </div>
      </div>

      <script src="https://cdn.amcharts.com/lib/5/index.js"></script>
      <script src="https://cdn.amcharts.com/lib/5/xy.js"></script>
      <script src="https://cdn.amcharts.com/lib/5/percent.js"></script>
      <script src="https://cdn.amcharts.com/lib/5/themes/Dark.js"></script>
      <script src="https://cdn.amcharts.com/lib/5/themes/Animated.js"></script>
      <script>
      (function() {
        var DATA = ${JSON.stringify(chartData)};

        function applyTheme(root) {
          root.setThemes([am5themes_Dark.new(root), am5themes_Animated.new(root)]);
          root._logo && root._logo.dispose();
        }

        // Time-series stacked column chart
        am5.ready(function() {
          if (DATA.byDay.length) {
            var root = am5.Root.new("chartTime");
            applyTheme(root);
            var chart = root.container.children.push(am5xy.XYChart.new(root, {
              panX: false, panY: false, wheelX: "none", wheelY: "none", paddingLeft: 0, paddingRight: 0
            }));
            var xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, {
              categoryField: "day",
              renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 50 }),
            }));
            xAxis.data.setAll(DATA.byDay);
            var yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
              renderer: am5xy.AxisRendererY.new(root, {})
            }));
            function makeSeries(name, field, color) {
              var series = chart.series.push(am5xy.ColumnSeries.new(root, {
                name: name, xAxis: xAxis, yAxis: yAxis,
                valueYField: field, categoryXField: "day", stacked: true,
                fill: am5.color(color), stroke: am5.color(color),
                tooltip: am5.Tooltip.new(root, { labelText: "{name}: {valueY}" }),
              }));
              series.data.setAll(DATA.byDay);
            }
            makeSeries("Home Church", "home_church", 0x60a5fa);
            makeSeries("Cell Group", "cell_group", 0x34d399);
            chart.set("cursor", am5xy.XYCursor.new(root, {}));
            var legend = chart.children.push(am5.Legend.new(root, { centerX: am5.p50, x: am5.p50 }));
            legend.data.setAll(chart.series.values);
          } else {
            document.getElementById("chartTime").innerHTML = '<p class="muted" style="text-align:center;padding:60px 0;">No data</p>';
          }

          // Type pie chart
          if (DATA.byType.length) {
            var root2 = am5.Root.new("chartType");
            applyTheme(root2);
            var chart2 = root2.container.children.push(am5percent.PieChart.new(root2, {
              layout: root2.verticalLayout, innerRadius: am5.percent(50)
            }));
            var series2 = chart2.series.push(am5percent.PieSeries.new(root2, {
              valueField: "count", categoryField: "type",
            }));
            series2.labels.template.set("forceHidden", true);
            series2.ticks.template.set("forceHidden", true);
            series2.data.setAll(DATA.byType);
            var legend2 = chart2.children.push(am5.Legend.new(root2, { centerX: am5.p50, x: am5.p50, marginTop: 10 }));
            legend2.data.setAll(series2.dataItems);
          } else {
            document.getElementById("chartType").innerHTML = '<p class="muted" style="text-align:center;padding:60px 0;">No data</p>';
          }

          // Area horizontal bar
          if (DATA.byArea.length) {
            var root3 = am5.Root.new("chartArea");
            applyTheme(root3);
            var chart3 = root3.container.children.push(am5xy.XYChart.new(root3, {
              panX: false, panY: false, wheelX: "none", wheelY: "none"
            }));
            var yAxis3 = chart3.yAxes.push(am5xy.CategoryAxis.new(root3, {
              categoryField: "area", renderer: am5xy.AxisRendererY.new(root3, { inversed: true })
            }));
            yAxis3.data.setAll(DATA.byArea);
            var xAxis3 = chart3.xAxes.push(am5xy.ValueAxis.new(root3, {
              renderer: am5xy.AxisRendererX.new(root3, {})
            }));
            var series3 = chart3.series.push(am5xy.ColumnSeries.new(root3, {
              xAxis: xAxis3, yAxis: yAxis3, valueXField: "count", categoryYField: "area",
              fill: am5.color(0x818cf8), stroke: am5.color(0x818cf8),
              tooltip: am5.Tooltip.new(root3, { labelText: "{categoryY}: {valueX}" }),
            }));
            series3.data.setAll(DATA.byArea);
          } else {
            document.getElementById("chartArea").innerHTML = '<p class="muted" style="text-align:center;padding:60px 0;">No data</p>';
          }
        });
      })();
      </script>`;
    res.send(layout('Reports', body, { user: req.adminSession.username, active: 'reports' }));
  } catch (err) {
    next(err);
  }
});

router.get('/admin/pages', async (req, res, next) => {
  try {
    const pages = await listPages();
    const rows = pages
      .map(
        (p) => `<tr>
          <td><span class="badge badge-mono">${escapeHtml(p.page_id)}</span></td>
          <td><strong>${escapeHtml(p.page_name || '—')}</strong></td>
          <td class="cell-mono">${escapeHtml(new Date(p.updated_at).toLocaleString())}</td>
          <td>
            <div class="row-actions">
              <form class="inline-form" method="post" action="/admin/pages/${escapeHtml(p.page_id)}/profile">
                <button type="submit" class="btn btn-outline btn-sm">Install Get Started</button>
              </form>
              <form class="inline-form" method="post" action="/admin/pages/${escapeHtml(p.page_id)}/delete" onsubmit="return confirm('Delete this page? This cannot be undone.');">
                <button type="submit" class="btn btn-destructive btn-sm">Delete</button>
              </form>
            </div>
          </td>
        </tr>`
      )
      .join('');

    const body = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Pages</h1>
          <p class="page-subtitle">Facebook Pages connected to this tracker.</p>
        </div>
      </div>
      ${flashFromQuery(req.query)}
      ${
        pages.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>Page ID</th><th>Name</th><th>Updated</th><th style="text-align:right">Actions</th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>`
          : '<div class="empty">No pages registered yet. Add one below to start receiving messages.</div>'
      }

      <h2 class="section-title">Add or update a page</h2>
      <div class="card" style="max-width: 640px;">
        <div class="card-header">
          <h3 class="card-title">Register page access token</h3>
          <p class="card-description">The token is stored in the database and used to send replies and look up sender names.</p>
        </div>
        <form method="post" action="/admin/pages">
          <div class="card-content">
            <div class="form-row">
              <label class="label" for="page_id">Page ID</label>
              <input class="input" id="page_id" type="text" name="page_id" required placeholder="1044820368721242" />
            </div>
            <div class="form-row">
              <label class="label" for="page_name">Page name</label>
              <input class="input" id="page_name" type="text" name="page_name" placeholder="My Church Page" />
            </div>
            <div class="form-row">
              <label class="label" for="page_access_token">Page access token</label>
              <textarea class="textarea" id="page_access_token" name="page_access_token" required placeholder="EAA..."></textarea>
            </div>
          </div>
          <div class="card-footer">
            <button type="submit" class="btn btn-primary">Save page</button>
          </div>
        </form>
      </div>`;
    res.send(layout('Pages', body, { user: req.adminSession.username, active: 'pages' }));
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
