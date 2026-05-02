'use strict';

const { query } = require('../db/database');
const { sendMessage } = require('./messenger.service');
const { getAccessToken } = require('./pages.service');
const config = require('../config');
const logger = require('../utils/logger');

// ---------- Constants ---------------------------------------------------------

const STATE = {
  IDLE: 'IDLE',
  AWAITING_TYPE: 'AWAITING_TYPE',
  AWAITING_AREA: 'AWAITING_AREA',
  AWAITING_AREA_OTHER: 'AWAITING_AREA_OTHER',
  AWAITING_DETAILS: 'AWAITING_DETAILS',
  AWAITING_LOCATION: 'AWAITING_LOCATION',
  AWAITING_ATTENDEES: 'AWAITING_ATTENDEES',
  AWAITING_IMAGE: 'AWAITING_IMAGE',
};

const PAYLOAD = {
  GET_STARTED: 'GET_STARTED',
  RECORD_ACTIVITY: 'RECORD_ACTIVITY',
  HELP: 'HELP',
  TYPE_HOME_CHURCH: 'TYPE_HOME_CHURCH',
  TYPE_CELL_GROUP: 'TYPE_CELL_GROUP',
  AREA_1: 'AREA_1',
  AREA_2: 'AREA_2',
  AREA_3: 'AREA_3',
  AREA_4: 'AREA_4',
  AREA_5: 'AREA_5',
  AREA_OTHER: 'AREA_OTHER',
  SKIP_IMAGE: 'SKIP_IMAGE',
  CANCEL: 'CANCEL',
};

const MAIN_MENU_QUICK_REPLIES = [
  { content_type: 'text', title: 'Record Activity', payload: PAYLOAD.RECORD_ACTIVITY },
  { content_type: 'text', title: 'Help', payload: PAYLOAD.HELP },
];

const TYPE_QUICK_REPLIES = [
  { content_type: 'text', title: 'Home Church', payload: PAYLOAD.TYPE_HOME_CHURCH },
  { content_type: 'text', title: 'Cell Group', payload: PAYLOAD.TYPE_CELL_GROUP },
  { content_type: 'text', title: 'Cancel', payload: PAYLOAD.CANCEL },
];

const AREA_QUICK_REPLIES = [
  { content_type: 'text', title: 'Area 1', payload: PAYLOAD.AREA_1 },
  { content_type: 'text', title: 'Area 2', payload: PAYLOAD.AREA_2 },
  { content_type: 'text', title: 'Area 3', payload: PAYLOAD.AREA_3 },
  { content_type: 'text', title: 'Area 4', payload: PAYLOAD.AREA_4 },
  { content_type: 'text', title: 'Area 5', payload: PAYLOAD.AREA_5 },
  { content_type: 'text', title: 'Other', payload: PAYLOAD.AREA_OTHER },
  { content_type: 'text', title: 'Cancel', payload: PAYLOAD.CANCEL },
];

const SKIP_QUICK_REPLIES = [
  { content_type: 'text', title: 'Skip', payload: PAYLOAD.SKIP_IMAGE },
  { content_type: 'text', title: 'Cancel', payload: PAYLOAD.CANCEL },
];

const HELP_TEXT =
  'I can help you log Home Church and Cell Group activities. Tap "Record Activity" to start. ' +
  'You can type "cancel" anytime to stop.';

// ---------- DB helpers --------------------------------------------------------

async function loadConversation(pageId, senderPsid) {
  const r = await query(
    `SELECT state, draft FROM conversations WHERE page_id = $1 AND sender_psid = $2`,
    [pageId, senderPsid]
  );
  return r.rows[0] || null;
}

async function saveConversation(pageId, senderPsid, state, draft) {
  await query(
    `INSERT INTO conversations (page_id, sender_psid, state, draft, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (page_id, sender_psid)
     DO UPDATE SET state = EXCLUDED.state, draft = EXCLUDED.draft, updated_at = now()`,
    [pageId, senderPsid, state, draft]
  );
}

async function clearConversation(pageId, senderPsid) {
  await query(
    `DELETE FROM conversations WHERE page_id = $1 AND sender_psid = $2`,
    [pageId, senderPsid]
  );
}

async function insertSubmission(pageId, senderPsid, draft) {
  const r = await query(
    `INSERT INTO submissions (page_id, sender_psid, type, area, details, location, attendees, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [
      pageId,
      senderPsid,
      draft.type || null,
      draft.area || null,
      draft.details || null,
      draft.location || null,
      Number.isFinite(draft.attendees) ? draft.attendees : null,
      draft.image_url || null,
    ]
  );
  return r.rows[0];
}

// ---------- Event extraction --------------------------------------------------

/**
 * Extract a normalized intent from a Messenger event:
 *  - { kind: 'postback', payload }
 *  - { kind: 'quick_reply', payload, text }
 *  - { kind: 'text', text }
 *  - { kind: 'image', url }   (first image attachment)
 *  - { kind: 'attachment', subtype } (non-image)
 *  - null  (nothing actionable)
 */
function extractIntent(ev) {
  if (ev.postback && ev.postback.payload) {
    return { kind: 'postback', payload: ev.postback.payload };
  }
  const msg = ev.message;
  if (!msg) return null;
  if (msg.quick_reply && msg.quick_reply.payload) {
    return { kind: 'quick_reply', payload: msg.quick_reply.payload, text: msg.text || null };
  }
  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    const first = msg.attachments[0];
    if (first && first.type === 'image' && first.payload && first.payload.url) {
      return { kind: 'image', url: first.payload.url };
    }
    return { kind: 'attachment', subtype: first && first.type };
  }
  if (typeof msg.text === 'string' && msg.text.length > 0) {
    return { kind: 'text', text: msg.text };
  }
  return null;
}

// ---------- Main entry --------------------------------------------------------

/**
 * Process a Messenger event for the conversation flow.
 * Returns true if the event was handled by the flow (so caller should suppress
 * any other auto-reply), false otherwise.
 */
async function handleEvent(pageId, senderPsid, ev) {
  if (!pageId || !senderPsid) return false;

  const intent = extractIntent(ev);
  if (!intent) return false;

  const accessToken = (await getAccessToken(pageId)) || config.pageAccessToken || null;
  const send = (text, opts = {}) => sendMessage(senderPsid, text, { accessToken, ...opts });

  // Global commands first.
  if (intent.kind === 'postback' && intent.payload === PAYLOAD.GET_STARTED) {
    await clearConversation(pageId, senderPsid);
    await send('Welcome! What would you like to do today?', { quickReplies: MAIN_MENU_QUICK_REPLIES });
    return true;
  }
  if (
    (intent.kind === 'postback' && intent.payload === PAYLOAD.HELP) ||
    (intent.kind === 'text' && intent.text.trim().toLowerCase() === 'help')
  ) {
    await send(HELP_TEXT, { quickReplies: MAIN_MENU_QUICK_REPLIES });
    return true;
  }
  const isCancel =
    (intent.kind === 'quick_reply' && intent.payload === PAYLOAD.CANCEL) ||
    (intent.kind === 'text' && intent.text.trim().toLowerCase() === 'cancel');
  if (isCancel) {
    await clearConversation(pageId, senderPsid);
    await send('Cancelled. Tap below when you want to record again.', {
      quickReplies: MAIN_MENU_QUICK_REPLIES,
    });
    return true;
  }

  // Start flow.
  const isStart =
    (intent.kind === 'postback' && intent.payload === PAYLOAD.RECORD_ACTIVITY) ||
    (intent.kind === 'quick_reply' && intent.payload === PAYLOAD.RECORD_ACTIVITY);
  if (isStart) {
    await saveConversation(pageId, senderPsid, STATE.AWAITING_TYPE, {});
    await send('What type of activity are you recording?', { quickReplies: TYPE_QUICK_REPLIES });
    return true;
  }

  // In-flow handling.
  const conv = await loadConversation(pageId, senderPsid);
  if (!conv) {
    // Not in a flow; let other handlers (legacy auto-reply / classifier) run.
    return false;
  }
  const draft = conv.draft || {};

  try {
    switch (conv.state) {
      case STATE.AWAITING_TYPE: {
        let chosen = null;
        if (intent.kind === 'quick_reply') {
          if (intent.payload === PAYLOAD.TYPE_HOME_CHURCH) chosen = 'Home Church';
          else if (intent.payload === PAYLOAD.TYPE_CELL_GROUP) chosen = 'Cell Group';
        } else if (intent.kind === 'text') {
          const t = intent.text.trim().toLowerCase();
          if (t.startsWith('home')) chosen = 'Home Church';
          else if (t.startsWith('cell')) chosen = 'Cell Group';
        }
        if (!chosen) {
          await send('Please tap one of the options below.', { quickReplies: TYPE_QUICK_REPLIES });
          return true;
        }
        draft.type = chosen;
        await saveConversation(pageId, senderPsid, STATE.AWAITING_AREA, draft);
        await send('Which Area is this for?', { quickReplies: AREA_QUICK_REPLIES });
        return true;
      }

      case STATE.AWAITING_AREA: {
        let chosen = null;
        let goOther = false;
        if (intent.kind === 'quick_reply') {
          const map = {
            [PAYLOAD.AREA_1]: 'Area 1',
            [PAYLOAD.AREA_2]: 'Area 2',
            [PAYLOAD.AREA_3]: 'Area 3',
            [PAYLOAD.AREA_4]: 'Area 4',
            [PAYLOAD.AREA_5]: 'Area 5',
          };
          if (map[intent.payload]) chosen = map[intent.payload];
          else if (intent.payload === PAYLOAD.AREA_OTHER) goOther = true;
        } else if (intent.kind === 'text') {
          const t = intent.text.trim().toLowerCase();
          const m = t.match(/^(?:area\s*)?([1-5])$/);
          if (m) chosen = `Area ${m[1]}`;
          else if (t === 'other') goOther = true;
        }
        if (goOther) {
          await saveConversation(pageId, senderPsid, STATE.AWAITING_AREA_OTHER, draft);
          await send('Please type the area name.');
          return true;
        }
        if (!chosen) {
          await send('Please tap one of the options below.', { quickReplies: AREA_QUICK_REPLIES });
          return true;
        }
        draft.area = chosen;
        await saveConversation(pageId, senderPsid, STATE.AWAITING_DETAILS, draft);
        await send('Please type the details (topic / agenda / notes).');
        return true;
      }

      case STATE.AWAITING_AREA_OTHER: {
        if (intent.kind !== 'text') {
          await send('Please type the area name as a text message.');
          return true;
        }
        draft.area = intent.text.trim().slice(0, 100);
        await saveConversation(pageId, senderPsid, STATE.AWAITING_DETAILS, draft);
        await send('Please type the details (topic / agenda / notes).');
        return true;
      }

      case STATE.AWAITING_DETAILS: {
        if (intent.kind !== 'text') {
          await send('Please type the details as a text message.');
          return true;
        }
        draft.details = intent.text.trim();
        await saveConversation(pageId, senderPsid, STATE.AWAITING_LOCATION, draft);
        await send('Where was it held? (address / area / landmark)');
        return true;
      }

      case STATE.AWAITING_LOCATION: {
        if (intent.kind !== 'text') {
          await send('Please type the location as a text message.');
          return true;
        }
        draft.location = intent.text.trim();
        await saveConversation(pageId, senderPsid, STATE.AWAITING_ATTENDEES, draft);
        await send('How many attendees? (send a number)');
        return true;
      }

      case STATE.AWAITING_ATTENDEES: {
        const raw = intent.kind === 'text' ? intent.text.trim() : '';
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 0 || n > 100000) {
          await send('Please send a valid number, e.g. 12');
          return true;
        }
        draft.attendees = n;
        await saveConversation(pageId, senderPsid, STATE.AWAITING_IMAGE, draft);
        await send("Please send 1 photo (optional). You can skip by tapping 'Skip'.", {
          quickReplies: SKIP_QUICK_REPLIES,
        });
        return true;
      }

      case STATE.AWAITING_IMAGE: {
        let imageUrl = null;
        let skip = false;
        if (intent.kind === 'image') {
          imageUrl = intent.url;
        } else if (intent.kind === 'quick_reply' && intent.payload === PAYLOAD.SKIP_IMAGE) {
          skip = true;
        } else if (intent.kind === 'text' && intent.text.trim().toLowerCase() === 'skip') {
          skip = true;
        } else {
          await send("Please send a photo or tap 'Skip'.", { quickReplies: SKIP_QUICK_REPLIES });
          return true;
        }
        if (imageUrl) draft.image_url = imageUrl;
        const saved = await insertSubmission(pageId, senderPsid, draft);
        await clearConversation(pageId, senderPsid);
        const summary =
          'Saved \u2705\n' +
          `Type: ${draft.type}\n` +          `Area: ${draft.area || '—'}\n` +          `Details: ${draft.details}\n` +
          `Location: ${draft.location}\n` +
          `Attendees: ${draft.attendees}\n` +
          `Image: ${draft.image_url ? 'Yes' : 'No'}\n` +
          `Ref: #${saved.id}`;
        await send(summary, { quickReplies: MAIN_MENU_QUICK_REPLIES });
        return true;
      }

      default: {
        // Unknown state — reset.
        await clearConversation(pageId, senderPsid);
        await send('Let\u2019s start over. What would you like to do?', {
          quickReplies: MAIN_MENU_QUICK_REPLIES,
        });
        return true;
      }
    }
  } catch (err) {
    logger.error('conversation flow error:', err.message);
    return true;
  }
}

// ---------- Submissions query (admin) -----------------------------------------

async function listSubmissions({ page_id, sender_psid, type, area, pageIds, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  const add = (col, val) => {
    params.push(val);
    where.push(`${col} = $${params.length}`);
  };
  if (page_id) add('page_id', page_id);
  if (sender_psid) add('sender_psid', sender_psid);
  if (type) add('type', type);
  if (area) add('area', area);
  if (Array.isArray(pageIds)) {
    if (pageIds.length === 0) {
      where.push('FALSE');
    } else {
      params.push(pageIds);
      where.push(`page_id = ANY($${params.length}::text[])`);
    }
  }

  const lim = Math.min(parseInt(limit, 10) || 50, 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const itemsParams = [...params, lim, off];
  const itemsSql = `SELECT * FROM submissions ${whereSql}
                    ORDER BY created_at DESC
                    LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`;
  const totalSql = `SELECT COUNT(*)::int AS c FROM submissions ${whereSql}`;
  const [items, total] = await Promise.all([query(itemsSql, itemsParams), query(totalSql, params)]);
  return { total: total.rows[0].c, limit: lim, offset: off, items: items.rows };
}

// ---------- Profile installation ---------------------------------------------

const DEFAULT_PROFILE = {
  get_started: { payload: PAYLOAD.GET_STARTED },
  greeting: [
    {
      locale: 'default',
      text: 'Welcome! Tap Get Started to record a Home Church or Cell Group activity.',
    },
  ],
  persistent_menu: [
    {
      locale: 'default',
      composer_input_disabled: false,
      call_to_actions: [
        { type: 'postback', title: 'Record Activity', payload: PAYLOAD.RECORD_ACTIVITY },
        { type: 'postback', title: 'Help', payload: PAYLOAD.HELP },
      ],
    },
  ],
};

async function getReportsData({ page_id, pageIds, days = 30 } = {}) {
  const where = [];
  const params = [];
  if (page_id) {
    params.push(page_id);
    where.push(`page_id = $${params.length}`);
  }
  if (Array.isArray(pageIds)) {
    if (pageIds.length === 0) {
      where.push('FALSE');
    } else {
      params.push(pageIds);
      where.push(`page_id = ANY($${params.length}::text[])`);
    }
  }
  const d = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
  params.push(`${d} days`);
  where.push(`created_at >= NOW() - $${params.length}::interval`);
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const totalsSql = `SELECT
      COUNT(*)::int AS total_submissions,
      COALESCE(SUM(attendees), 0)::int AS total_attendees,
      COUNT(DISTINCT sender_psid)::int AS unique_senders
    FROM submissions ${whereSql}`;

  const byTypeSql = `SELECT type, COUNT(*)::int AS count,
      COALESCE(SUM(attendees), 0)::int AS attendees
    FROM submissions ${whereSql}
    GROUP BY type ORDER BY count DESC`;

  const byAreaSql = `SELECT COALESCE(area, '(none)') AS area, COUNT(*)::int AS count,
      COALESCE(SUM(attendees), 0)::int AS attendees
    FROM submissions ${whereSql}
    GROUP BY COALESCE(area, '(none)') ORDER BY count DESC`;

  const byDaySql = `SELECT DATE(created_at AT TIME ZONE 'UTC')::text AS day,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE type = 'Home Church')::int AS home_church,
      COUNT(*) FILTER (WHERE type = 'Cell Group')::int AS cell_group
    FROM submissions ${whereSql}
    GROUP BY day ORDER BY day ASC`;

  const topSendersSql = `SELECT sender_psid, page_id, COUNT(*)::int AS count
    FROM submissions ${whereSql}
    GROUP BY sender_psid, page_id ORDER BY count DESC LIMIT 10`;

  const [totals, byType, byArea, byDay, topSenders] = await Promise.all([
    query(totalsSql, params),
    query(byTypeSql, params),
    query(byAreaSql, params),
    query(byDaySql, params),
    query(topSendersSql, params),
  ]);

  return {
    days: d,
    totals: totals.rows[0],
    byType: byType.rows,
    byArea: byArea.rows,
    byDay: byDay.rows,
    topSenders: topSenders.rows,
  };
}

module.exports = {
  STATE,
  PAYLOAD,
  DEFAULT_PROFILE,
  handleEvent,
  listSubmissions,
  getReportsData,
};
