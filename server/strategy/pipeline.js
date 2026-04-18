const DailySignal = require('../models/DailySignal');
const nifty50 = require('./nifty50Instruments');
const {
  limiter,
  getDailyCandles,
  getIntradayCandles,
  prewarmDailyCache,
  getCachedDaily
} = require('./fetchData');
const {
  computeVolMA10,
  computeATR5Pct,
  computeGapPct,
  computeNiftyMA20,
  directionFromCandle,
  directionFromGap,
  directionFromNiftyOpen,
  computeGapAtrRatio,
  getPrevCloseFromDaily
} = require('./calculations');
const { evaluateFilters } = require('./filters');
const { getTodayIST, isWeekendIST } = require('../utils/dateUtils');
const { HOLIDAYS_2025, HOLIDAYS_2026 } = require('./nseHolidays');

let status = { running: false, lastRanAt: null, lastStatus: 'IDLE' };

function isHoliday(dateStr) {
  return HOLIDAYS_2025.includes(dateStr) || HOLIDAYS_2026.includes(dateStr);
}

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

function yyyyMmDdToUtcMs(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

function previousISTDate(yyyyMmDd) {
  const ms = yyyyMmDdToUtcMs(yyyyMmDd);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function lastExpectedTradingDate(today) {
  // Expect previous trading session (skip weekends/holidays).
  let d = previousISTDate(today);
  if (!d) return null;
  while (true) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 Sun ... 6 Sat
    const weekend = dow === 0 || dow === 6;
    if (!weekend && !isHoliday(d)) return d;
    d = previousISTDate(d);
    if (!d) return null;
  }
}

function isDailyBarFreshEnough(lastDailyDate, today) {
  // Hybrid: allow weekend gap (Fri->Mon is 3 calendar days) plus one extra day per consecutive holiday.
  // Also accept the exact last expected trading session date.
  if (!lastDailyDate) return false;
  const expected = lastExpectedTradingDate(today);
  if (expected && lastDailyDate === expected) return true;

  let allowedDays = 3; // covers Fri -> Mon
  let cursor = today;
  while (true) {
    cursor = previousISTDate(cursor);
    if (!cursor) break;
    const dow = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    if (weekend) continue;
    if (isHoliday(cursor)) {
      allowedDays += 1;
      continue;
    }
    break; // reached last non-holiday weekday
  }

  const diffDays = dayDiffFromTodayIST(lastDailyDate);
  return diffDays <= allowedDays;
}

async function detectRegime(vix, atrValues) {
  if (vix < 15) return { regime: 'LOW_VOL', avgAtrScan: average(atrValues.filter((v) => v >= 1.75)), activeTiebreaker: false };
  if (vix > 20) return { regime: 'HIGH_VOL', avgAtrScan: average(atrValues.filter((v) => v >= 1.75)), activeTiebreaker: false };
  const eligible = atrValues.filter((v) => v >= 1.75);
  const avgAtrScan = average(eligible);
  return { regime: avgAtrScan >= 2.5 ? 'HIGH_VOL' : 'LOW_VOL', avgAtrScan, activeTiebreaker: true };
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sortScanRows(rows) {
  const rank = (row) => {
    if (row.result === 'SELECTED') return 0;
    if (row.result === 'PASSED') return 1;
    if (row.f5Pass) return 2;
    if (row.f4Pass) return 3;
    if (row.f3Pass) return 4;
    if (row.f2Pass) return 5;
    if (row.f1Pass) return 6;
    return 7;
  };
  return rows.sort((a, b) => rank(a) - rank(b));
}

function dateOnlyFromCandleTs(candleTs) {
  if (!candleTs) return null;
  return String(candleTs).split('T')[0] || null;
}

function dayDiffFromTodayIST(yyyyMmDd) {
  if (!yyyyMmDd) return Number.POSITIVE_INFINITY;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return Number.POSITIVE_INFINITY;
  const [ty, tm, td] = getTodayIST().split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(ty, tm - 1, td);
  return Math.floor((today - target) / (24 * 60 * 60 * 1000));
}

async function runScan({ manual = false } = {}) {
  if (status.running) return;
  status.running = true;
  status.lastRanAt = new Date();
  status.lastStatus = 'RUNNING';
  limiter.startScanCounter();

  const today = getTodayIST();
  if (!manual && (isWeekendIST() || isHoliday(today))) {
    status.running = false;
    status.lastStatus = 'SKIPPED';
    limiter.stopScanCounter();
    return;
  }

  try {
    const existing = await DailySignal.findOne({ date: today }).select('status');
    if (!manual && existing && (existing.status === 'COMPLETED' || existing.status === 'NO_TRADE')) {
      console.log(`Scan skipped: already has status ${existing.status} for ${today}`);
      status.lastStatus = 'SKIPPED_ALREADY_DONE';
      return;
    }
    const niftyDaily = await getDailyCandles('NSE_INDEX|Nifty 50');
    const niftyIntraday = await getIntradayCandles('NSE_INDEX|Nifty 50');
    const vixDaily = await getDailyCandles('NSE_INDEX|India VIX');

    const niftyMA20 = computeNiftyMA20(niftyDaily);
    if (niftyMA20 == null) {
      throw new Error('Nifty MA20 could not be computed — insufficient daily data');
    }
    const vixUsed = Number(vixDaily[vixDaily.length - 1][4]);
    const niftyDirection = directionFromNiftyOpen(Number(niftyIntraday[0][1]), niftyMA20);

    const preRows = [];
    const atrValues = [];

    for (const item of nifty50) {
      try {
        const daily = getCachedDaily(item.instrumentKey) || (await getDailyCandles(item.instrumentKey));
        const lastDailyDate = dateOnlyFromCandleTs(daily?.[daily.length - 1]?.[0]);
        if (!isDailyBarFreshEnough(lastDailyDate, today)) {
          console.warn(`STALE DATA WARNING: ${item.symbol} last daily bar is ${lastDailyDate}`);
          throw new Error(`Stale daily data: ${lastDailyDate}`);
        }
        const intraday = await getIntradayCandles(item.instrumentKey);
        if (intraday.length < 2) {
          throw new Error('Not enough intraday candles');
        }

        const prevClose = getPrevCloseFromDaily(daily);
        const volMA10 = computeVolMA10(daily);
        const vol915 = Number(intraday[0][5]);
        if (volMA10 == null) {
          console.warn(`INSUFFICIENT DAILY HISTORY: ${item.symbol} has <10 daily candles (Vol_MA10 unavailable)`);
        }
        const volRatio = volMA10 ? vol915 / volMA10 : 0;
        const atrPct = computeATR5Pct(daily);
        if (atrPct != null) atrValues.push(atrPct);

        const gapPct = computeGapPct(Number(intraday[0][1]), prevClose);
        const gapDirection = directionFromGap(gapPct);
        const candle915Direction = directionFromCandle(intraday[0]);
        const candle920Direction = directionFromCandle(intraday[1]);
        const gapAtrRatio = computeGapAtrRatio(gapPct, atrPct);

        preRows.push({
          symbol: item.symbol,
          daily,
          intraday,
          volRatio,
          atrPct,
          gapPct,
          gapAtrRatio,
          gapDirection,
          candle915Direction,
          candle920Direction,
          niftyDirection
        });
      } catch (error) {
        console.error(`Stock fetch failed for ${item.symbol}:`, error.message);
        preRows.push({
          symbol: item.symbol,
          intraday: [null, null],
          volRatio: null,
          atrPct: null,
          gapPct: null,
          gapAtrRatio: null,
          gapDirection: null,
          candle915Direction: null,
          candle920Direction: null,
          niftyDirection: null,
          fetchFailed: true
        });
      }
    }

    const { regime, avgAtrScan } = await detectRegime(vixUsed, atrValues.filter((v) => v != null));

    const evaluated = preRows.map((row) => {
      if (row.fetchFailed) {
        return {
          symbol: row.symbol,
          volRatio: null,
          atrPct: null,
          gapPct: null,
          gapAtrRatio: null,
          f1Pass: false,
          f2Pass: false,
          f3Pass: false,
          f4Pass: false,
          f5Pass: false,
          allPass: false,
          isSelected: false,
          result: 'FAILED_FETCH',
          entryPrice: null,
          gapDirection: null
        };
      }
      const f = evaluateFilters({
        regime,
        volRatio: row.volRatio,
        atrPct: row.atrPct,
        gapPct: row.gapPct,
        gapDirection: row.gapDirection,
        candle915Direction: row.candle915Direction,
        candle920Direction: row.candle920Direction,
        niftyDirection: row.niftyDirection
      });

      return {
        symbol: row.symbol,
        volRatio: row.volRatio,
        atrPct: row.atrPct,
        gapPct: row.gapPct,
        gapAtrRatio: row.gapAtrRatio,
        f1Pass: f.f1Pass,
        f2Pass: f.f2Pass,
        f3Pass: f.f3Pass,
        f4Pass: f.f4Pass,
        f5Pass: f.f5Pass,
        allPass: f.allPass,
        isSelected: false,
        result: f.allPass ? 'PASSED' : `FAILED_${f.failedAt}`,
        entryPrice: Number(row.intraday[1][4]),
        gapDirection: row.gapDirection
      };
    });

    const winners = evaluated.filter((x) => x.allPass).sort((a, b) => (b.gapAtrRatio || 0) - (a.gapAtrRatio || 0));
    const selected = winners[0] || null;

    let signal = 'NO_TRADE';
    let stock = null;
    let entryPrice = null;
    let tpPrice = null;
    let slPrice = null;
    let chosen = null;

    if (selected) {
      signal = selected.gapDirection === 'BULLISH' ? 'LONG' : 'SHORT';
      stock = selected.symbol;
      entryPrice = selected.entryPrice;
      if (regime === 'HIGH_VOL') {
        tpPrice = signal === 'LONG' ? entryPrice * 1.0125 : entryPrice * 0.9875;
      } else {
        tpPrice = signal === 'LONG' ? entryPrice * 1.01 : entryPrice * 0.99;
      }
      slPrice = signal === 'LONG' ? entryPrice * 0.9925 : entryPrice * 1.0075;
      entryPrice = round2(entryPrice);
      tpPrice = round2(tpPrice);
      slPrice = round2(slPrice);
      chosen = selected;
    }

    const scanDetails = evaluated.map((row) => {
      const isSelected = !!chosen && row.symbol === chosen.symbol;
      return {
        ...row,
        isSelected,
        result: isSelected ? 'SELECTED' : row.result
      };
    });

    await DailySignal.findOneAndUpdate(
      { date: today },
      {
        date: today,
        regime,
        vixUsed,
        avgAtrScan,
        signal,
        stock,
        entryPrice,
        tpPrice,
        slPrice,
        gapPct: chosen?.gapPct ?? null,
        atrPct: chosen?.atrPct ?? null,
        volRatio: chosen?.volRatio ?? null,
        gapAtrRatio: chosen?.gapAtrRatio ?? null,
        scanRanAt: new Date(),
        status: signal === 'NO_TRADE' ? 'NO_TRADE' : 'COMPLETED',
        errorMessage: null,
        scanDetails: sortScanRows(scanDetails)
      },
      { upsert: true, new: true }
    );

    status.lastStatus = 'COMPLETED';
  } catch (error) {
    console.error('Scan failed:', error.message);
    await DailySignal.findOneAndUpdate(
      { date: getTodayIST() },
      {
        date: getTodayIST(),
        status: 'FAILED',
        errorMessage: error.message,
        scanRanAt: new Date(),
        avgAtrScan: null
      },
      { upsert: true, new: true }
    );
    status.lastStatus = 'FAILED';
  } finally {
    status.running = false;
    limiter.stopScanCounter();
  }
}

async function runPrewarm() {
  if (isWeekendIST() || isHoliday(getTodayIST())) return;
  const instruments = ['NSE_INDEX|Nifty 50', 'NSE_INDEX|India VIX', ...nifty50.map((x) => x.instrumentKey)];
  await prewarmDailyCache(instruments);
}

async function markEOD() {
  const today = getTodayIST();
  if (isWeekendIST() || isHoliday(today)) return;
  await DailySignal.findOneAndUpdate({ date: today }, { eodMarkedAt: new Date() });
}

function getScanStatus() {
  return status;
}

module.exports = { runScan, runPrewarm, markEOD, getScanStatus };
