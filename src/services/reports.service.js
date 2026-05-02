'use strict';

const { query } = require('../db/database');
const { dayBoundsUtc, weekBoundsUtc, listDays, toIsoDay } = require('../utils/dates');

function rangeFilter(from, to) {
  const where = [];
  const params = [];
  if (from) {
    params.push(from);
    where.push(`created_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`created_at < $${params.length}`);
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function countsByCategory(from, to) {
  const { whereSql, params } = rangeFilter(from, to);
  const r = await query(
    `SELECT category, COUNT(*)::int AS count FROM activities ${whereSql}
     GROUP BY category ORDER BY count DESC`,
    params
  );
  return r.rows;
}

async function countsBySender(from, to) {
  const { whereSql, params } = rangeFilter(from, to);
  const r = await query(
    `SELECT sender_psid, COUNT(*)::int AS count FROM activities ${whereSql}
     GROUP BY sender_psid ORDER BY count DESC`,
    params
  );
  return r.rows;
}

async function listByCategory(from, to, category) {
  const { whereSql, params } = rangeFilter(from, to);
  params.push(category);
  const sql = whereSql
    ? `${whereSql} AND category = $${params.length}`
    : `WHERE category = $${params.length}`;
  const r = await query(`SELECT * FROM activities ${sql} ORDER BY created_at DESC`, params);
  return r.rows;
}

async function topTags(from, to, limit = 10) {
  const { whereSql, params } = rangeFilter(from, to);
  const r = await query(`SELECT tags FROM activities ${whereSql}`, params);
  const counter = new Map();
  for (const row of r.rows) {
    if (!row.tags) continue;
    for (const t of row.tags.split(',')) {
      const key = t.trim();
      if (!key) continue;
      counter.set(key, (counter.get(key) || 0) + 1);
    }
  }
  return Array.from(counter.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

async function totalCount(from, to) {
  const { whereSql, params } = rangeFilter(from, to);
  const r = await query(`SELECT COUNT(*)::int AS c FROM activities ${whereSql}`, params);
  return r.rows[0].c;
}

async function activeUsersCount(from, to) {
  const { whereSql, params } = rangeFilter(from, to);
  const r = await query(
    `SELECT COUNT(DISTINCT sender_psid)::int AS c FROM activities ${whereSql}`,
    params
  );
  return r.rows[0].c;
}

async function dailyReport(dateStr) {
  const { startIso, endIso } = dayBoundsUtc(dateStr);
  const [total, byCategory, bySender, blockers, incidents, tags] = await Promise.all([
    totalCount(startIso, endIso),
    countsByCategory(startIso, endIso),
    countsBySender(startIso, endIso),
    listByCategory(startIso, endIso, 'BLOCKER'),
    listByCategory(startIso, endIso, 'INCIDENT'),
    topTags(startIso, endIso),
  ]);
  return {
    date: dateStr,
    range: { from: startIso, to: endIso },
    total,
    byCategory,
    bySender,
    blockers,
    incidents,
    topTags: tags,
  };
}

async function countsPerDay(startIso, endIso) {
  const days = listDays(startIso, endIso);
  const result = {};
  days.forEach((d) => (result[d] = 0));
  const r = await query(
    `SELECT created_at FROM activities WHERE created_at >= $1 AND created_at < $2`,
    [startIso, endIso]
  );
  for (const row of r.rows) {
    const day = toIsoDay(row.created_at);
    if (result[day] !== undefined) result[day] += 1;
  }
  return result;
}

async function weeklyReport(startDateStr) {
  const { startIso, endIso } = weekBoundsUtc(startDateStr);
  const [total, byCategory, perDay, blockers, incidents, tags, activeUsers] = await Promise.all([
    totalCount(startIso, endIso),
    countsByCategory(startIso, endIso),
    countsPerDay(startIso, endIso),
    listByCategory(startIso, endIso, 'BLOCKER'),
    listByCategory(startIso, endIso, 'INCIDENT'),
    topTags(startIso, endIso),
    activeUsersCount(startIso, endIso),
  ]);
  return {
    start: startDateStr,
    range: { from: startIso, to: endIso },
    total,
    byCategory,
    perDay,
    blockers,
    incidents,
    topTags: tags,
    activeUsers,
  };
}

async function categoryCounts(from, to) {
  return countsByCategory(from, to);
}

async function userCounts(from, to) {
  return countsBySender(from, to);
}

module.exports = { dailyReport, weeklyReport, categoryCounts, userCounts };
