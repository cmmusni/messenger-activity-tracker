'use strict';

const express = require('express');
const config = require('../config');
const logger = require('../utils/logger');
const { verifyMetaSignature } = require('../middleware/metaSignature');
const { processEntry } = require('../services/activity.service');

const router = express.Router();

// GET /webhook — Meta verification handshake
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === config.verifyToken) {
    logger.info('Webhook verified successfully.');
    return res.status(200).type('text/plain').send(String(challenge));
  }
  logger.warn('Webhook verification failed.');
  return res.sendStatus(403);
});

// POST /webhook — Meta event delivery
const isServerless = !!process.env.VERCEL;

router.post('/webhook', verifyMetaSignature, async (req, res) => {
  const body = req.body || {};

  if (body.object !== 'page') {
    return res.sendStatus(404);
  }

  const entries = Array.isArray(body.entry) ? body.entry : [];

  if (isServerless) {
    // Serverless: do work BEFORE responding (background tasks get killed).
    try {
      for (const entry of entries) {
        await processEntry(entry);
      }
    } catch (err) {
      logger.error('Webhook processing error:', err.message);
    }
    return res.status(200).send('EVENT_RECEIVED');
  }

  // Long-lived server: ack fast, process in background.
  res.status(200).send('EVENT_RECEIVED');
  setImmediate(async () => {
    try {
      for (const entry of entries) {
        await processEntry(entry);
      }
    } catch (err) {
      logger.error('Webhook background processing error:', err.message);
    }
  });
});

module.exports = router;
