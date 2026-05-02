'use strict';

const express = require('express');
const { listActivities } = require('../services/activity.service');

const router = express.Router();

router.get('/activities', async (req, res, next) => {
  try {
    const { from, to, category, sender_psid, team, project, limit, offset } = req.query;
    const data = await listActivities({ from, to, category, sender_psid, team, project, limit, offset });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
