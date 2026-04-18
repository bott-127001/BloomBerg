const express = require('express');
const { runScan, getScanStatus } = require('../strategy/pipeline');

const router = express.Router();

router.post('/trigger', async (_req, res) => {
  runScan({ manual: true }).catch((e) => console.error(e));
  res.json({ message: 'Scan triggered' });
});

router.get('/status', async (_req, res) => {
  res.json(getScanStatus());
});

module.exports = router;
