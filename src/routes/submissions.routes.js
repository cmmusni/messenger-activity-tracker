'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/adminAuth');
const { listSubmissions } = require('../services/conversation.service');

const router = express.Router();

router.use('/submissions', adminAuth);

router.get('/submissions', async (req, res, next) => {
  try {
    const { page_id, sender_psid, type, limit, offset } = req.query;
    res.json(await listSubmissions({ page_id, sender_psid, type, limit, offset }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
