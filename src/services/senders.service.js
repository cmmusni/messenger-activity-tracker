'use strict';

const axios = require('axios');
const { query } = require('../db/database');
const { getAccessToken } = require('./pages.service');
const config = require('../config');
const logger = require('../utils/logger');

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // refresh weekly

async function getCached(pageId, psid) {
  const r = await query(
    `SELECT name, profile_pic, fetched_at FROM senders WHERE page_id = $1 AND sender_psid = $2`,
    [pageId, psid]
  );
  return r.rows[0] || null;
}

async function upsertCached(pageId, psid, name, profilePic) {
  await query(
    `INSERT INTO senders (page_id, sender_psid, name, profile_pic, fetched_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (page_id, sender_psid)
     DO UPDATE SET name = EXCLUDED.name, profile_pic = EXCLUDED.profile_pic, fetched_at = now()`,
    [pageId, psid, name || null, profilePic || null]
  );
}

async function fetchFromGraph(pageId, psid) {
  const accessToken = (await getAccessToken(pageId)) || config.pageAccessToken;
  if (!accessToken) return null;
  const url = `https://graph.facebook.com/${config.graphApiVersion}/${psid}`;
  try {
    const res = await axios.get(url, {
      params: { fields: 'name,profile_pic', access_token: accessToken },
      timeout: 6000,
    });
    return { name: res.data.name || null, profile_pic: res.data.profile_pic || null };
  } catch (err) {
    const data = err.response && err.response.data;
    logger.warn('User Profile lookup failed:', data && data.error ? data.error.message : err.message);
    return null;
  }
}

/**
 * Get a sender's display name. Cached in DB; refreshes after TTL.
 * Returns { name, profile_pic } or null.
 */
async function getSenderProfile(pageId, psid) {
  if (!pageId || !psid) return null;
  const cached = await getCached(pageId, psid);
  const fresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS;
  if (cached && fresh) return { name: cached.name, profile_pic: cached.profile_pic };
  const live = await fetchFromGraph(pageId, psid);
  if (live) {
    await upsertCached(pageId, psid, live.name, live.profile_pic);
    return live;
  }
  // If live fetch failed but we have a stale cache, return it.
  if (cached) return { name: cached.name, profile_pic: cached.profile_pic };
  return null;
}

/**
 * Bulk-resolve names for a list of (page_id, sender_psid) pairs.
 * Returns Map keyed as `${pageId}:${psid}` -> { name, profile_pic }.
 */
async function getSenderProfiles(pairs) {
  const map = new Map();
  // Dedup
  const uniq = new Map();
  for (const p of pairs) {
    if (!p || !p.pageId || !p.psid) continue;
    uniq.set(`${p.pageId}:${p.psid}`, p);
  }
  await Promise.all(
    Array.from(uniq.values()).map(async (p) => {
      const profile = await getSenderProfile(p.pageId, p.psid);
      map.set(`${p.pageId}:${p.psid}`, profile || { name: null, profile_pic: null });
    })
  );
  return map;
}

module.exports = { getSenderProfile, getSenderProfiles };
