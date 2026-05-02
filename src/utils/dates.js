'use strict';

function toIsoDay(date) {
  const d = new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dayBoundsUtc(yyyyMmDd) {
  const start = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid date: ${yyyyMmDd}`);
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function weekBoundsUtc(startYyyyMmDd) {
  const { startIso } = dayBoundsUtc(startYyyyMmDd);
  const start = new Date(startIso);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function listDays(startIso, endIso) {
  const days = [];
  let cursor = new Date(startIso);
  const end = new Date(endIso);
  while (cursor < end) {
    days.push(toIsoDay(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = { toIsoDay, dayBoundsUtc, weekBoundsUtc, listDays, nowIso };
