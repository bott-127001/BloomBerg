function takeLast(arr, n) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(Math.max(0, arr.length - n));
}

function getPrevCloseFromDaily(daily) {
  if (!daily?.length) return null;
  // After partial-today strip, the last row is the latest full session; its close is prev ref for today's open.
  return Number(daily[daily.length - 1][4]);
}

function computeVolMA10From915(fiveMinCandles) {
  if (!Array.isArray(fiveMinCandles)) return null;
  const bars915 = fiveMinCandles.filter((candle) => {
    const ts = new Date(candle[0]);
    const hh = Number(ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
    const mm = Number(ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', minute: '2-digit', hour12: false }));
    return hh === 9 && mm === 15;
  });
  const last10 = takeLast(bars915, 10);
  if (last10.length < 10) return null;
  return last10.reduce((acc, c) => acc + Number(c[5] || 0), 0) / 10;
}

function computeATR5Pct(dailyCandles) {
  if (dailyCandles.length < 6) return null;
  const candles = takeLast(dailyCandles, 6);
  const trValues = [];
  for (let i = 1; i < candles.length; i += 1) {
    const [_, open, high, low, close] = candles[i].map(Number);
    const prevClose = Number(candles[i - 1][4]);
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);
  }
  const atrPoints = trValues.reduce((a, b) => a + b, 0) / trValues.length;
  // After stripping today's partial bar, the last candle is the previous session close (denominator for ATR%).
  const mostRecentPrevClose = Number(candles[candles.length - 1][4]);
  return (atrPoints / mostRecentPrevClose) * 100;
}

function computeGapPct(intradayOpen, prevClose) {
  return ((Number(intradayOpen) - Number(prevClose)) / Number(prevClose)) * 100;
}

function computeNiftyMA20(niftyDailyCandles) {
  const candles = takeLast(niftyDailyCandles, 20);
  if (candles.length < 20) return null;
  return candles.reduce((acc, c) => acc + Number(c[4]), 0) / 20;
}

function directionFromCandle(candle) {
  if (!candle) return null;
  const open = Number(candle[1]);
  const close = Number(candle[4]);
  const diff = close - open;
  // Avoid classifying tiny floating-point noise as direction.
  if (diff > 0.01) return 'BULLISH';
  if (diff < -0.01) return 'BEARISH';
  return 'DOJI';
}

function directionFromGap(gapPct) {
  if (gapPct > 0) return 'BULLISH';
  if (gapPct < 0) return 'BEARISH';
  return null;
}

function directionFromNiftyOpen(niftyOpen, ma20) {
  if (niftyOpen > ma20) return 'BULLISH';
  if (niftyOpen < ma20) return 'BEARISH';
  return null;
}

function computeGapAtrRatio(gapPct, atrPct) {
  if (!atrPct) return null;
  return Math.abs(gapPct) / atrPct;
}

module.exports = {
  computeVolMA10From915,
  computeATR5Pct,
  computeGapPct,
  computeNiftyMA20,
  directionFromCandle,
  directionFromGap,
  directionFromNiftyOpen,
  computeGapAtrRatio,
  getPrevCloseFromDaily
};
