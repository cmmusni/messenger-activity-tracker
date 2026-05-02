'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/adminAuth');
const { upsertPage, listPages, deletePage, getAccessToken } = require('../services/pages.service');
const { installMessengerProfile } = require('../services/messenger.service');
const { DEFAULT_PROFILE } = require('../services/conversation.service');

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

/**
 * Install Get Started + persistent menu + greeting on the page.
 * Body may optionally override DEFAULT_PROFILE.
 */
router.post('/pages/:pageId/profile', async (req, res, next) => {
  try {
    const { pageId } = req.params;
    const accessToken = await getAccessToken(pageId);
    if (!accessToken) {
      return res.status(404).json({ error: 'Page not found or has no access token' });
    }
    const profile = req.body && Object.keys(req.body).length > 0 ? req.body : DEFAULT_PROFILE;
    const result = await installMessengerProfile(profile, { accessToken });
    if (!result.ok) return res.status(502).json({ error: result.error, status: result.status });
    res.json({ installed: true, profile, meta: result.data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
