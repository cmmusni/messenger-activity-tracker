'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/adminAuth');
const { sendTextMessage } = require('../services/messenger.service');

const router = express.Router();

router.post('/messages/send', adminAuth, async (req, res, next) => {
  try {
    const { recipientId, text } = req.body || {};
    if (!recipientId || !text) {
      return res.status(400).json({ error: 'recipientId and text are required' });
    }
    const result = await sendTextMessage(recipientId, text);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
