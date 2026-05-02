'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/adminAuth');
const { upsertPage, listPages, deletePage } = require('../services/pages.service');

const router = express.Router();

// All /pages endpoints require admin auth (they manage page access tokens).
router.use('/pages', adminAuth);

router.get('/pages', async (req, res, next) => {
  try {
    res.json(await listPages());
  } catch (err) {
    next(err);
  }
});

router.post('/pages', async (req, res, next) => {
  try {
    const { pageId, page_id, pageName, page_name, accessToken, page_access_token } = req.body || {};
    const id = pageId || page_id;
    const name = pageName || page_name || null;
    const token = accessToken || page_access_token;
    if (!id || !token) {
      return res.status(400).json({ error: 'pageId and accessToken are required' });
    }
    const row = await upsertPage({ pageId: String(id), pageName: name, accessToken: token });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/pages/:pageId', async (req, res, next) => {
  try {
    const ok = await deletePage(req.params.pageId);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
