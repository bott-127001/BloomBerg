const express = require('express');
const { getIntradayCandles } = require('../strategy/fetchData');
const { isWithinISTRange } = require('../utils/dateUtils');

const router = express.Router();

router.get('/indices', async (_req, res) => {
  try {
    const nifty = await getIntradayCandles('NSE_INDEX|Nifty 50');
    const vix = await getIntradayCandles('NSE_INDEX|India VIX');

    const latestNifty = nifty[nifty.length - 1];
    const latestVix = vix[vix.length - 1];

    res.json({
      nifty50: latestNifty ? Number(latestNifty[4]) : null,
      indiaVix: latestVix ? Number(latestVix[4]) : null,
      marketOpen: isWithinISTRange(9, 0, 15, 30)
    });
  } catch (error) {
    console.error('market/indices:', error.message);
    res.status(502).json({
      nifty50: null,
      indiaVix: null,
      marketOpen: isWithinISTRange(9, 0, 15, 30),
      error: 'Index data unavailable'
    });
  }
});

module.exports = router;
