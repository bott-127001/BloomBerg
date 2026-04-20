const DailySignal = require('../models/DailySignal');
const nifty50 = require('./nifty50Instruments');
const {
  limiter,
  getDailyCandles,
  getIntradayCandles,
  getHistorical5MinCandles,
  prewarmDailyCache,
  getCachedDaily,
  getCached5Min,
  dateShift
} = require('./fetchData');
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
} = require('./calculations');
const { evaluateFiltersPhase14, passesF5Only } = require('./filters');
const { getTodayIST, isWeekendIST } = require('../utils/dateUtils');
const { HOLIDAYS_2025, HOLIDAYS_2026 } = require('./nseHolidays');

/** In-memory handoff between phase 1 (9:21) and phase 2 (9:26) within one process. */
let phase1Shortlist = null;

let status = {
  running: false,
  lastRanAt: null,
  lastStatus: 'IDLE',
  phase: 'IDLE'
};

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
  let d = previousISTDate(today);
  if (!d) return null;
  while (true) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    if (!weekend && !isHoliday(d)) return d;
    d = previousISTDate(d);
    if (!d) return null;
  }
}

function isDailyBarFreshEnough(lastDailyDate, today) {
  if (!lastDailyDate) return false;
  const expected = lastExpectedTradingDate(today);
  if (expected && lastDailyDate === expected) return true;

  let allowedDays = 3;
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
    break;
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

function phase1ScanRowToDetail(row, regime) {
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
      f5Pass: null,
      allPass: false,
      isSelected: false,
      result: 'FAILED_FETCH'
    };
  }

  const f = evaluateFiltersPhase14({
    regime,
    volRatio: row.volRatio,
    atrPct: row.atrPct,
    gapPct: row.gapPct,
    gapDirection: row.gapDirection,
    candle915Direction: row.candle915Direction,
    niftyDirection: row.niftyDirection
  });

  let result = 'FAILED_F1';
  if (!f.f1Pass) result = 'FAILED_F1';
  else if (!f.f2Pass) result = 'FAILED_F2';
  else if (!f.f3Pass) result = 'FAILED_F3';
  else if (!f.f4Pass) result = 'FAILED_F4';
  else result = 'PASSED_F14';

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
    f5Pass: null,
    allPass: false,
    isSelected: false,
    result
  };
}

async function runScanPhase1({ manual = false } = {}) {
  if (status.phase === 'PHASE1_RUNNING' || status.phase === 'PHASE2_RUNNING') return;

  const today = getTodayIST();
  if (!manual && (isWeekendIST() || isHoliday(today))) {
    status.lastStatus = 'SKIPPED';
    return;
  }

  status.running = true;
  status.lastRanAt = new Date();
  status.lastStatus = 'RUNNING';
  status.phase = 'PHASE1_RUNNING';
  limiter.startScanCounter();

  try {
    const existing = await DailySignal.findOne({ date: today }).select('status');
    if (
      !manual &&
      existing &&
      (existing.status === 'COMPLETED' || existing.status === 'NO_TRADE' || existing.status === 'PHASE1_DONE')
    ) {
      console.log(`Phase 1 skipped: already has status ${existing.status} for ${today}`);
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

    const stockRows = [];
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
        const fiveMin =
          getCached5Min(item.instrumentKey) ||
          (await getHistorical5MinCandles(item.instrumentKey, dateShift(22), dateShift(0)));
        const volMA10 = computeVolMA10From915(fiveMin);
        const vol915 = Number(intraday[0][5]);
        if (volMA10 == null) {
          console.warn(`INSUFFICIENT 9:15 HISTORY: ${item.symbol} has <10 historical 9:15 bars (Vol_MA10 unavailable)`);
        }
        const volRatio = volMA10 ? vol915 / volMA10 : 0;
        const atrPct = computeATR5Pct(daily);
        if (atrPct != null) atrValues.push(atrPct);

        const gapPct = computeGapPct(Number(intraday[0][1]), prevClose);
        const gapDirection = directionFromGap(gapPct);
        const candle915Direction = directionFromCandle(intraday[0]);
        const gapAtrRatio = computeGapAtrRatio(gapPct, atrPct);

        stockRows.push({
          symbol: item.symbol,
          instrumentKey: item.instrumentKey,
          volRatio,
          atrPct,
          gapPct,
          gapAtrRatio,
          gapDirection,
          candle915Direction,
          niftyDirection,
          fetchFailed: false
        });
      } catch (error) {
        console.error(`Stock fetch failed for ${item.symbol}:`, error.message);
        stockRows.push({
          symbol: item.symbol,
          instrumentKey: item.instrumentKey,
          fetchFailed: true
        });
      }
    }

    const { regime, avgAtrScan } = await detectRegime(vixUsed, atrValues.filter((v) => v != null));

    const allRowsDetails = stockRows.map((row) => phase1ScanRowToDetail(row, regime));

    const shortlistSymbols = allRowsDetails.filter((r) => r.result === 'PASSED_F14').map((r) => r.symbol);

    const shortlist = stockRows.filter((row) => !row.fetchFailed && shortlistSymbols.includes(row.symbol));

    phase1Shortlist = {
      date: today,
      regime,
      vixUsed,
      avgAtrScan,
      niftyDirection,
      shortlist,
      allRows: stockRows
    };

    const scanDetails = sortScanRows(allRowsDetails);

    await DailySignal.findOneAndUpdate(
      { date: today },
      {
        date: today,
        regime,
        vixUsed,
        avgAtrScan,
        signal: 'NO_TRADE',
        stock: null,
        entryPrice: null,
        tpPrice: null,
        slPrice: null,
        gapPct: null,
        atrPct: null,
        volRatio: null,
        gapAtrRatio: null,
        scanRanAt: new Date(),
        status: 'PHASE1_DONE',
        errorMessage: null,
        scanDetails
      },
      { upsert: true, new: true }
    );

    status.lastStatus = 'COMPLETED';
    const names = shortlistSymbols.join(', ');
    console.log(`Phase 1 complete. Shortlist: ${shortlistSymbols.length} stocks passed F1-F4: ${names}`);
  } catch (error) {
    console.error('Phase 1 failed:', error.message);
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
    if (status.phase === 'PHASE1_RUNNING') {
      status.phase = status.lastStatus === 'FAILED' ? 'FAILED' : 'IDLE';
    }
  }
}

async function runScanPhase2({ manual = false } = {}) {
  if (status.phase === 'PHASE1_RUNNING' || status.phase === 'PHASE2_RUNNING') return;

  const today = getTodayIST();
  if (!manual && (isWeekendIST() || isHoliday(today))) {
    status.lastStatus = 'SKIPPED';
    return;
  }

  status.running = true;
  status.lastRanAt = new Date();
  status.lastStatus = 'RUNNING';
  status.phase = 'PHASE2_RUNNING';
  limiter.startScanCounter();

  try {
    const existing = await DailySignal.findOne({ date: today }).select('status');
    if (!manual && existing && (existing.status === 'COMPLETED' || existing.status === 'NO_TRADE')) {
      console.log(`Phase 2 skipped: already has status ${existing.status} for ${today}`);
      status.lastStatus = 'SKIPPED_ALREADY_DONE';
      return;
    }

    if ((!phase1Shortlist || phase1Shortlist.date !== today) && existing?.status === 'PHASE1_DONE') {
      const doc = await DailySignal.findOne({ date: today });
      const keyBySymbol = new Map(nifty50.map((x) => [x.symbol, x.instrumentKey]));
      const shortlistFromDb = (doc?.scanDetails || [])
        .filter((r) => r.result === 'PASSED_F14')
        .map((r) => ({
          symbol: r.symbol,
          instrumentKey: keyBySymbol.get(r.symbol),
          volRatio: r.volRatio,
          atrPct: r.atrPct,
          gapPct: r.gapPct,
          gapAtrRatio: r.gapAtrRatio,
          gapDirection: directionFromGap(Number(r.gapPct)),
          fetchFailed: false
        }))
        .filter((r) => r.instrumentKey);

      phase1Shortlist = {
        date: today,
        regime: doc.regime,
        vixUsed: doc.vixUsed,
        avgAtrScan: doc.avgAtrScan,
        niftyDirection: null,
        shortlist: shortlistFromDb,
        allRows: []
      };
    }

    if (!phase1Shortlist || phase1Shortlist.date !== today) {
      const msg = 'Phase 1 result not found for today — aborting phase 2';
      console.error(msg);
      await DailySignal.findOneAndUpdate(
        { date: today },
        { date: today, status: 'FAILED', errorMessage: msg, scanRanAt: new Date() },
        { upsert: true, new: true }
      );
      status.lastStatus = 'FAILED';
      return;
    }

    const { regime, vixUsed, avgAtrScan, shortlist } = phase1Shortlist;

    const prevDetails = await DailySignal.findOne({ date: today }).select('scanDetails');
    const detailBySymbol = new Map((prevDetails?.scanDetails || []).map((r) => [r.symbol, { ...r }]));

    if (!shortlist.length) {
      const scanDetails = sortScanRows([...(detailBySymbol.values())]);
      await DailySignal.findOneAndUpdate(
        { date: today },
        {
          date: today,
          regime,
          vixUsed,
          avgAtrScan,
          signal: 'NO_TRADE',
          stock: null,
          entryPrice: null,
          tpPrice: null,
          slPrice: null,
          gapPct: null,
          atrPct: null,
          volRatio: null,
          gapAtrRatio: null,
          scanRanAt: new Date(),
          status: 'NO_TRADE',
          errorMessage: null,
          scanDetails
        },
        { upsert: true, new: true }
      );
      phase1Shortlist = null;
      status.lastStatus = 'COMPLETED';
      console.log('Phase 2 complete. Signal: NO_TRADE Entry: null TP: null SL: null');
      return;
    }

    const phase2Evaluated = [];

    for (const row of shortlist) {
      try {
        const intraday = await getIntradayCandles(row.instrumentKey);
        if (intraday.length < 2) {
          throw new Error('Not enough intraday candles');
        }
        const candle920Direction = directionFromCandle(intraday[1]);
        const f5Pass = passesF5Only(row.gapDirection, candle920Direction);

        phase2Evaluated.push({
          symbol: row.symbol,
          gapDirection: row.gapDirection,
          gapPct: row.gapPct,
          atrPct: row.atrPct,
          volRatio: row.volRatio,
          gapAtrRatio: row.gapAtrRatio,
          candle920Direction,
          f5Pass,
          intraday,
          fetchFailed: false
        });
      } catch (error) {
        console.error(`Phase 2 fetch failed for ${row.symbol}:`, error.message);
        phase2Evaluated.push({
          symbol: row.symbol,
          gapDirection: row.gapDirection,
          gapPct: row.gapPct,
          atrPct: row.atrPct,
          volRatio: row.volRatio,
          gapAtrRatio: row.gapAtrRatio,
          candle920Direction: null,
          f5Pass: false,
          intraday: null,
          fetchFailed: true
        });
      }
    }

    const winners = phase2Evaluated
      .filter((x) => !x.fetchFailed && x.f5Pass)
      .sort((a, b) => (b.gapAtrRatio || 0) - (a.gapAtrRatio || 0));

    const selected = winners[0] || null;

    let signal = 'NO_TRADE';
    let stock = null;
    let entryPrice = null;
    let tpPrice = null;
    let slPrice = null;
    let chosenSymbol = null;

    if (selected && selected.intraday) {
      signal = selected.gapDirection === 'BULLISH' ? 'LONG' : 'SHORT';
      stock = selected.symbol;
      entryPrice = Number(selected.intraday[1][4]);
      if (regime === 'HIGH_VOL') {
        tpPrice = signal === 'LONG' ? entryPrice * 1.0125 : entryPrice * 0.9875;
      } else {
        tpPrice = signal === 'LONG' ? entryPrice * 1.01 : entryPrice * 0.99;
      }
      slPrice = signal === 'LONG' ? entryPrice * 0.9925 : entryPrice * 1.0075;
      entryPrice = round2(entryPrice);
      tpPrice = round2(tpPrice);
      slPrice = round2(slPrice);
      chosenSymbol = stock;
    }

    for (const ev of phase2Evaluated) {
      const base = detailBySymbol.get(ev.symbol);
      if (!base) continue;

      let result = base.result;
      if (base.result === 'PASSED_F14') {
        if (ev.fetchFailed) result = 'FAILED_FETCH';
        else if (!ev.f5Pass) result = 'FAILED_F5';
        else result = 'PASSED';
      }

      const allPass = base.f4Pass && !ev.fetchFailed && ev.f5Pass;

      detailBySymbol.set(ev.symbol, {
        ...base,
        f5Pass: ev.fetchFailed ? false : ev.f5Pass,
        allPass,
        result,
        isSelected: false
      });
    }

    if (chosenSymbol) {
      const sel = detailBySymbol.get(chosenSymbol);
      if (sel) {
        detailBySymbol.set(chosenSymbol, {
          ...sel,
          isSelected: true,
          result: 'SELECTED'
        });
      }
    }

    const scanDetails = sortScanRows([...detailBySymbol.values()]);

    const chosenRow = chosenSymbol ? detailBySymbol.get(chosenSymbol) : null;

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
        gapPct: chosenRow?.gapPct ?? null,
        atrPct: chosenRow?.atrPct ?? null,
        volRatio: chosenRow?.volRatio ?? null,
        gapAtrRatio: chosenRow?.gapAtrRatio ?? null,
        scanRanAt: new Date(),
        status: signal === 'NO_TRADE' ? 'NO_TRADE' : 'COMPLETED',
        errorMessage: null,
        scanDetails
      },
      { upsert: true, new: true }
    );

    phase1Shortlist = null;
    status.lastStatus = 'COMPLETED';

    console.log(`Phase 2 complete. Signal: ${signal} ${stock || ''} Entry: ${entryPrice ?? 'null'} TP: ${tpPrice ?? 'null'} SL: ${slPrice ?? 'null'}`);
  } catch (error) {
    console.error('Phase 2 failed:', error.message);
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
    if (status.phase === 'PHASE2_RUNNING') {
      status.phase = status.lastStatus === 'FAILED' ? 'FAILED' : 'IDLE';
    }
  }
}

async function triggerFullScanManual() {
  await runScanPhase1({ manual: true });
  await runScanPhase2({ manual: true });
}

async function runPrewarm() {
  if (isWeekendIST() || isHoliday(getTodayIST())) return;
  const instruments = ['NSE_INDEX|Nifty 50', 'NSE_INDEX|India VIX', ...nifty50.map((x) => x.instrumentKey)];
  await prewarmDailyCache(instruments);
  for (const item of nifty50) {
    try {
      await getHistorical5MinCandles(item.instrumentKey, dateShift(22), dateShift(0));
    } catch (error) {
      console.error(`Prewarm 5m failed for ${item.symbol}:`, error.message);
    }
  }
}

async function markEOD() {
  const today = getTodayIST();
  if (isWeekendIST() || isHoliday(today)) return;
  await DailySignal.findOneAndUpdate({ date: today }, { eodMarkedAt: new Date() });
}

async function getScanStatus() {
  if (status.running || status.phase === 'PHASE1_RUNNING' || status.phase === 'PHASE2_RUNNING') {
    return { ...status };
  }

  const today = getTodayIST();
  const doc = await DailySignal.findOne({ date: today }).select('status');
  const st = doc?.status;

  let phase = 'IDLE';
  if (st === 'PHASE1_DONE') phase = 'PHASE1_DONE';
  else if (st === 'FAILED') phase = 'FAILED';
  else if (st === 'COMPLETED' || st === 'NO_TRADE') phase = 'COMPLETED';

  return { ...status, phase };
}

module.exports = {
  runScanPhase1,
  runScanPhase2,
  triggerFullScanManual,
  runPrewarm,
  markEOD,
  getScanStatus
};
