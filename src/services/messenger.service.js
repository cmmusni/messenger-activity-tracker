'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Send a message via the Messenger Send API.
 * Optionally attach quick replies.
 */
async function sendMessage(recipientId, text, opts = {}) {
  const accessToken = opts.accessToken || config.pageAccessToken;
  if (!accessToken) {
    logger.warn('No access token available — skipping send.');
    return { skipped: true };
  }
  if (!recipientId || !text) {
    throw new Error('recipientId and text are required');
  }

  const message = { text: String(text).slice(0, 2000) };
  if (Array.isArray(opts.quickReplies) && opts.quickReplies.length > 0) {
    message.quick_replies = opts.quickReplies.slice(0, 13);
  }

  const url = `https://graph.facebook.com/${config.graphApiVersion}/me/messages`;
  const body = {
    recipient: { id: recipientId },
    message,
    messaging_type: 'RESPONSE',
  };

  try {
    const res = await axios.post(url, body, {
      params: { access_token: accessToken },
      timeout: 8000,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    const status = err.response && err.response.status;
    const data = err.response && err.response.data;
    logger.error('Messenger send failed:', {
      status,
      data: data && data.error ? data.error.message : data,
    });
    return { ok: false, status, error: data && data.error ? data.error.message : err.message };
  }
}

// Backwards-compatible alias.
async function sendTextMessage(recipientId, text, opts = {}) {
  return sendMessage(recipientId, text, opts);
}

/**
 * Install the Messenger Profile (Get Started, persistent menu, greeting).
 */
async function installMessengerProfile(profile, opts = {}) {
  const accessToken = opts.accessToken;
  if (!accessToken) throw new Error('accessToken is required');
  const url = `https://graph.facebook.com/${config.graphApiVersion}/me/messenger_profile`;
  try {
    const res = await axios.post(url, profile, {
      params: { access_token: accessToken },
      timeout: 10000,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    const data = err.response && err.response.data;
    logger.error('installMessengerProfile failed:', data || err.message);
    return {
      ok: false,
      status: err.response && err.response.status,
      error: data && data.error ? data.error.message : err.message,
    };
  }
}

module.exports = { sendMessage, sendTextMessage, installMessengerProfile };
