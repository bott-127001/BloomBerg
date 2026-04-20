const express = require('express');
const { triggerFullScanManual, getScanStatus } = require('../strategy/pipeline');

const router = express.Router();

router.post('/trigger', async (_req, res) => {
  try {
    await triggerFullScanManual();
    res.json({ message: 'Scan triggered (phase 1 + phase 2)' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Scan failed', error: e.message });
  }
});

router.get('/status', async (_req, res) => {
  res.json(await getScanStatus());
});

module.exports = router;
