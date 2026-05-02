'use strict';

const express = require('express');
const reports = require('../services/reports.service');
const { toIsoDay } = require('../utils/dates');

const router = express.Router();

router.get('/reports/daily', async (req, res, next) => {
  try {
    const date = req.query.date || toIsoDay(new Date());
    res.json(await reports.dailyReport(date));
  } catch (err) {
    next(err);
  }
});

router.get('/reports/weekly', async (req, res, next) => {
  try {
    const start = req.query.start;
    if (!start) return res.status(400).json({ error: 'start=YYYY-MM-DD is required' });
    res.json(await reports.weeklyReport(start));
  } catch (err) {
    next(err);
  }
});

router.get('/reports/categories', async (req, res, next) => {
  try {
    res.json(await reports.categoryCounts(req.query.from, req.query.to));
  } catch (err) {
    next(err);
  }
});

router.get('/reports/users', async (req, res, next) => {
  try {
    res.json(await reports.userCounts(req.query.from, req.query.to));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
