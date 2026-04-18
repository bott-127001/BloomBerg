const mongoose = require('mongoose');

const scanDetailSchema = new mongoose.Schema(
  {
    symbol: String,
    volRatio: Number,
    atrPct: Number,
    gapPct: Number,
    gapAtrRatio: Number,
    f1Pass: Boolean,
    f2Pass: Boolean,
    f3Pass: Boolean,
    f4Pass: Boolean,
    f5Pass: Boolean,
    allPass: Boolean,
    isSelected: Boolean,
    result: String
  },
  { _id: false }
);

const dailySignalSchema = new mongoose.Schema({
  date: { type: String, unique: true, index: true },
  regime: String,
  vixUsed: Number,
  avgAtrScan: Number,
  signal: String,
  stock: String,
  entryPrice: Number,
  tpPrice: Number,
  slPrice: Number,
  gapPct: Number,
  atrPct: Number,
  volRatio: Number,
  gapAtrRatio: Number,
  scanRanAt: Date,
  status: String,
  errorMessage: String,
  scanDetails: [scanDetailSchema],
  eodMarkedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DailySignal', dailySignalSchema);
