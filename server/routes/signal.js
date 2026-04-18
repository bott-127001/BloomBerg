const express = require('express');
const DailySignal = require('../models/DailySignal');
const { getTodayIST } = require('../utils/dateUtils');

const router = express.Router();

router.get('/today', async (_req, res) => {
  const doc = await DailySignal.findOne({ date: getTodayIST() });
  if (!doc) {
    return res.json({ status: 'pending', message: 'Prewarm starts at 9:00 AM IST. Scan runs at 9:22 AM IST.' });
  }
  return res.json(doc);
});

router.get('/history', async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 30), 200);
  const docs = await DailySignal.find({}).sort({ date: -1 }).limit(limit).select('-scanDetails');
  return res.json(docs);
});

module.exports = router;
