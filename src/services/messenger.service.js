'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

async function sendTextMessage(recipientId, text) {
  if (!config.pageAccessToken) {
    logger.warn('PAGE_ACCESS_TOKEN not set — skipping send.');
    return { skipped: true };
  }
  if (!recipientId || !text) {
    throw new Error('recipientId and text are required');
  }

  const url = `https://graph.facebook.com/${config.graphApiVersion}/me/messages`;
  const body = {
    recipient: { id: recipientId },
    message: { text: String(text).slice(0, 2000) },
    messaging_type: 'RESPONSE',
  };

  try {
    const res = await axios.post(url, body, {
      params: { access_token: config.pageAccessToken },
      timeout: 8000,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    const status = err.response && err.response.status;
    const data = err.response && err.response.data;
    logger.error('Messenger send failed:', { status, data: data && data.error ? data.error.message : data });
    return { ok: false, status, error: data && data.error ? data.error.message : err.message };
  }
}

module.exports = { sendTextMessage };
