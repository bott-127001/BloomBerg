require('dotenv').config();
const nifty50 = require('../strategy/nifty50Instruments');
const {
  getDailyCandles,
  getIntradayCandles,
  getIntradayOneMinuteCandles,
  getHistorical5MinCandles,
  dateShift,
  aggregateToFiveMinute,
  getLastIntervalsUsed
} = require('../strategy/fetchData');
const {
  computeVolMA10From915,
  computeATR5Pct,
  computeGapPct,
  computeNiftyMA20,
  directionFromCandle,
  directionFromGap,
  directionFromNiftyOpen,
  computeGapAtrRatio,
  getPrevCloseFromDaily
} = require('../strategy/calculations');
const { evaluateFilters } = require('../strategy/filters');

async function main() {
  const reliance = nifty50.find((x) => x.symbol === 'RELIANCE');
  if (!reliance) throw new Error('RELIANCE instrument not found');

  const daily = await getDailyCandles(reliance.instrumentKey);
  const historical5m = await getHistorical5MinCandles(reliance.instrumentKey, dateShift(14), dateShift(0));
  const oneMinute = await getIntradayOneMinuteCandles(reliance.instrumentKey);
  const intraday = aggregateToFiveMinute(oneMinute);
  const niftyDaily = await getDailyCandles('NSE_INDEX|Nifty 50');
  const niftyIntraday = await getIntradayCandles('NSE_INDEX|Nifty 50');

  const window915to925 = oneMinute.filter((c) => {
    const ts = new Date(c[0]);
    const hh = ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false });
    const mm = ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', minute: '2-digit', hour12: false });
    const minutes = Number(hh) * 60 + Number(mm);
    return minutes >= 9 * 60 + 15 && minutes <= 9 * 60 + 25;
  });

  const bar915 = intraday.find((c) => {
    const ts = new Date(c[0]);
    const hh = ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false });
    const mm = ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', minute: '2-digit', hour12: false });
    return Number(hh) === 9 && Number(mm) === 15;
  });

  const bar920 = intraday.find((c) => {
    const ts = new Date(c[0]);
    const hh = ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false });
    const mm = ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', minute: '2-digit', hour12: false });
    return Number(hh) === 9 && Number(mm) === 20;
  });

  const bars915History = historical5m.filter((candle) => {
    const ts = new Date(candle[0]);
    const hh = Number(ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
    const mm = Number(ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', minute: '2-digit', hour12: false }));
    return hh === 9 && mm === 15;
  });
  const last10_915 = bars915History.slice(-10);
  const volMA10 = computeVolMA10From915(historical5m);

  if (!bar915 || !bar920 || !niftyIntraday.length) {
    console.log('');
    console.log('RELIANCE — STOP for your review');
    console.log('(Insufficient 9:15/9:20 intraday bars at this run time.)');
    console.log('Vol_MA(10) from historical 9:15 bars:', volMA10);
    console.log('9:15 volumes used for Vol_MA10 (last 10 sessions):');
    console.log(last10_915.map((c) => ({ ts: c[0], volume: Number(c[5] || 0) })));
    console.log({
      message: 'Insufficient intraday candles for 9:15/9:20 validation at current run time.',
      relianceOneMinuteCount: oneMinute.length,
      relianceFiveMinuteCount: intraday.length,
      niftyIntradayCount: niftyIntraday.length,
      intervalsUsed: getLastIntervalsUsed(),
      rawDailyLast5: daily.slice(-5),
      rawOneMinute915to925: window915to925.map((c) => c[0])
    });
    return;
  }

  const atrPct = computeATR5Pct(daily);
  const prevClose = getPrevCloseFromDaily(daily);
  const gapPct = computeGapPct(bar915[1], prevClose);
  const niftyMA20 = computeNiftyMA20(niftyDaily);
  const volRatio = Number(bar915[5]) / volMA10;
  const gapDirection = directionFromGap(gapPct);
  const candle915Direction = directionFromCandle(bar915);
  const candle920Direction = directionFromCandle(bar920);
  const niftyDirection = directionFromNiftyOpen(Number(niftyIntraday[0][1]), niftyMA20);
  const gapAtrRatio = computeGapAtrRatio(gapPct, atrPct);

  const filters = evaluateFilters({
    regime: 'LOW_VOL',
    volRatio,
    atrPct,
    gapPct,
    gapDirection,
    candle915Direction,
    candle920Direction,
    niftyDirection
  });

  const f = (k) => (filters[k] ? 'PASS' : 'FAIL');
  console.log('');
  console.log('RELIANCE — STOP for your review');
  console.log('---');
  console.log(`Vol_MA(10): ${volMA10?.toFixed?.(4) ?? volMA10}`);
  console.log(`ATR(5)%:    ${atrPct?.toFixed?.(4) ?? atrPct}`);
  console.log(`Gap%:       ${gapPct?.toFixed?.(4) ?? gapPct}`);
  console.log(`Nifty_MA20: ${niftyMA20?.toFixed?.(4) ?? niftyMA20}`);
  console.log(`Vol ratio:  ${volRatio?.toFixed?.(4) ?? volRatio}`);
  console.log('---');
  console.log(`F1: ${f('f1Pass')}  F2: ${f('f2Pass')}  F3: ${f('f3Pass')}  F4: ${f('f4Pass')}  F5: ${f('f5Pass')}  (regime assumed LOW_VOL for probe)`);
  console.log('9:15 volumes used for Vol_MA10 (last 10 sessions):');
  console.log(last10_915.map((c) => ({ ts: c[0], volume: Number(c[5] || 0) })));
  console.log('--- detail (intervals, bars, raw):');
  console.log({
    intervalsUsed: getLastIntervalsUsed(),
    rawDailyLast5: daily.slice(-5),
    rawOneMinute915to925: window915to925,
    bar915,
    bar920,
    computed: { volMA10, atrPct, gapPct, niftyMA20, volRatio, gapAtrRatio },
    filters
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
