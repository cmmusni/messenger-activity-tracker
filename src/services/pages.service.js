'use strict';

const { query } = require('../db/database');

async function upsertPage({ pageId, pageName, accessToken }) {
  const r = await query(
    `INSERT INTO pages (page_id, page_name, access_token, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (page_id) DO UPDATE
       SET page_name = EXCLUDED.page_name,
           access_token = EXCLUDED.access_token,
           updated_at = now()
     RETURNING page_id, page_name, created_at, updated_at`,
    [pageId, pageName || null, accessToken]
  );
  return r.rows[0];
}

async function listPages() {
  const r = await query(
    `SELECT page_id, page_name, created_at, updated_at FROM pages ORDER BY created_at DESC`
  );
  return r.rows;
}

async function deletePage(pageId) {
  const r = await query(`DELETE FROM pages WHERE page_id = $1`, [pageId]);
  return r.rowCount > 0;
}

async function getAccessToken(pageId) {
  if (!pageId) return null;
  const r = await query(`SELECT access_token FROM pages WHERE page_id = $1`, [pageId]);
  return r.rows[0] ? r.rows[0].access_token : null;
}

module.exports = { upsertPage, listPages, deletePage, getAccessToken };
