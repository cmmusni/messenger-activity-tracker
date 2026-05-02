'use strict';

const { query } = require('../db/database');
const { classify } = require('./classifier.service');
const { sendTextMessage } = require('./messenger.service');
const { getAccessToken } = require('./pages.service');
const config = require('../config');
const logger = require('../utils/logger');
const { nowIso } = require('../utils/dates');

function determineEventType(messagingEvent) {
  if (messagingEvent.message) return 'message';
  if (messagingEvent.postback) return 'postback';
  if (messagingEvent.delivery) return 'delivery';
  if (messagingEvent.read) return 'read';
  return 'unknown';
}

async function processEntry(entry) {
  const pageId = entry.id;
  const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging : [];

  for (const ev of messagingEvents) {
    try {
      await processMessagingEvent(pageId, ev);
    } catch (err) {
      logger.error('processMessagingEvent failed:', err.message);
    }
  }
}

async function processMessagingEvent(pageId, ev) {
  const eventType = determineEventType(ev);
  const senderPsid = (ev.sender && ev.sender.id) || null;
  const recipientId = (ev.recipient && ev.recipient.id) || null;
  const timestamp = ev.timestamp ? new Date(ev.timestamp).toISOString() : nowIso();
  const receivedAt = nowIso();
  const messageId = (ev.message && ev.message.mid) || null;
  const rawPayload = ev;

  await query(
    `INSERT INTO message_events (message_id, sender_psid, event_type, raw_payload, received_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [messageId, senderPsid, eventType, rawPayload, receivedAt]
  );

  let text = null;
  let activityMessageId = messageId;
  let attachmentSummary = null;

  if (eventType === 'message' && ev.message) {
    if (typeof ev.message.text === 'string' && ev.message.text.length > 0) {
      text = ev.message.text;
    }
    if (Array.isArray(ev.message.attachments) && ev.message.attachments.length > 0) {
      const types = ev.message.attachments.map((a) => a && a.type).filter(Boolean);
      attachmentSummary = types.join(',');
      // Synthesize a text label so the row carries useful info even when caption is empty.
      if (!text) text = `[attachment:${attachmentSummary}]`;
    }
  } else if (eventType === 'postback' && ev.postback) {
    text = ev.postback.payload || ev.postback.title || null;
    activityMessageId =
      activityMessageId || `postback_${pageId}_${senderPsid}_${ev.timestamp || Date.now()}`;
  }

  if (!text) return;

  const parsed = classify(text);
  // Tag attachment-only messages so they're easy to filter.
  if (attachmentSummary) {
    const tagSet = new Set(parsed.tags);
    tagSet.add('attachment');
    for (const t of attachmentSummary.split(',')) tagSet.add(t);
    parsed.tags = Array.from(tagSet);
  }

  const result = await query(
    `INSERT INTO activities (
       platform, page_id, sender_psid, recipient_id, message_id, event_type,
       text, raw_payload, category, tags, team, project, priority, ticket_ref,
       created_at, received_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
     )
     ON CONFLICT (message_id) DO NOTHING
     RETURNING id`,
    [
      'facebook_messenger',
      pageId || null,
      senderPsid,
      recipientId,
      activityMessageId,
      eventType,
      text,
      rawPayload,
      parsed.category,
      parsed.tags.length ? parsed.tags.join(',') : null,
      parsed.team,
      parsed.project,
      parsed.priority,
      parsed.ticketRef,
      timestamp,
      receivedAt,
    ]
  );

  const inserted = result.rowCount > 0;
  logger.info('Activity stored:', { inserted, category: parsed.category, sender: senderPsid });

  if (inserted && config.enableAutoReply && eventType === 'message' && senderPsid) {
    try {
      // Per-page token from DB takes precedence; fall back to env PAGE_ACCESS_TOKEN.
      const accessToken = (await getAccessToken(pageId)) || config.pageAccessToken || null;
      await sendTextMessage(senderPsid, `Logged ✅ Category: ${parsed.category}`, { accessToken });
    } catch (err) {
      logger.error('Auto-reply failed:', err.message);
    }
  }
}

async function listActivities({
  from,
  to,
  category,
  sender_psid,
  team,
  project,
  page_id,
  limit = 50,
  offset = 0,
} = {}) {
  const where = [];
  const params = [];
  const add = (col, op, val) => {
    params.push(val);
    where.push(`${col} ${op} $${params.length}`);
  };

  if (from) add('created_at', '>=', from);
  if (to) add('created_at', '<=', to);
  if (category) add('category', '=', category);
  if (sender_psid) add('sender_psid', '=', sender_psid);
  if (team) add('team', '=', team);
  if (project) add('project', '=', project);
  if (page_id) add('page_id', '=', page_id);

  const lim = Math.min(parseInt(limit, 10) || 50, 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const itemsParams = [...params, lim, off];
  const itemsSql = `SELECT * FROM activities ${whereSql}
                    ORDER BY created_at DESC
                    LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`;
  const totalSql = `SELECT COUNT(*)::int AS c FROM activities ${whereSql}`;

  const [items, total] = await Promise.all([query(itemsSql, itemsParams), query(totalSql, params)]);

  return {
    total: total.rows[0].c,
    limit: lim,
    offset: off,
    items: items.rows,
  };
}

module.exports = { processEntry, listActivities };
