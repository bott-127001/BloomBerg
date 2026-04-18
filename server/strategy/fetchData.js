const { getTodayIST } = require('../utils/dateUtils');
const { UpstoxRateLimiter, sleep } = require('./rateLimiter');

function candleISTDate(candle) {
  if (!candle?.[0]) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(candle[0]));
}

/** Drop trailing daily bar when it is today's IST date (partial during session). */
function stripPartialTodayDaily(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  if (candleISTDate(last) === getTodayIST()) {
    return candles.slice(0, -1);
  }
  return candles;
}

const BASE_URL = 'https://api.upstox.com/v3';
const dailyCache = new Map();
const fiveMinHistoryCache = new Map();
const limiter = new UpstoxRateLimiter();
let lastDailyIntervalUsed = null;
let lastIntradayIntervalUsed = null;

function encodeInstrumentKeyForPath(instrumentKey) {
  // Upstox expects instrument keys in path form like NSE_EQ|INE002A01018.
  // Keep the pipe literal and encode other unsafe characters.
  return encodeURIComponent(instrumentKey).replace(/%7C/gi, '|');
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.UPSTOX_TOKEN}`,
    Accept: 'application/json'
  };
}

function formatYMDFromUTCDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftYMD(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - days);
  return formatYMDFromUTCDate(utcMidnight);
}

function dateShift(days) {
  return shiftYMD(getTodayIST(), days);
}

function normalizeCandlesOldestFirst(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return candles || [];
  const firstTs = new Date(candles[0][0]).getTime();
  const lastTs = new Date(candles[candles.length - 1][0]).getTime();
  if (Number.isNaN(firstTs) || Number.isNaN(lastTs)) return candles;
  if (firstTs > lastTs) return [...candles].reverse();
  return candles;
}

async function upstoxRequest(path, retries = 1) {
  await limiter.waitTurn();
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() });
  if (res.status === 429 && retries > 0) {
    await sleep(5000);
    return upstoxRequest(path, retries - 1);
  }
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`Upstox error ${res.status}: ${txt}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return normalizeCandlesOldestFirst(json?.data?.candles || []);
}

async function getDailyCandles(instrumentKey, fromDate = dateShift(35), toDate = dateShift(0)) {
  const cacheKey = `${getTodayIST()}::${instrumentKey}`;
  if (dailyCache.has(cacheKey)) {
    return stripPartialTodayDaily(dailyCache.get(cacheKey));
  }
  const encodedKey = encodeInstrumentKeyForPath(instrumentKey);
  const preferredPath = `/historical-candle/${encodedKey}/days/1/${toDate}/${fromDate}`;
  if (instrumentKey === 'NSE_EQ|INE002A01018') {
    console.log(`[RELIANCE daily] URL: ${BASE_URL}${preferredPath}`);
    console.log(`[RELIANCE daily] toDate=${toDate} fromDate=${fromDate}`);
  }
  try {
    const candles = stripPartialTodayDaily(await upstoxRequest(preferredPath));
    lastDailyIntervalUsed = 'days/1';
    dailyCache.set(cacheKey, candles);
    return candles;
  } catch (error) {
    // Keep a legacy alias fallback in case account-specific validation expects singular unit.
    if (error.status === 400 && String(error.message).includes('Interval accepts')) {
      const fallbackPath = `/historical-candle/${encodedKey}/day/1/${toDate}/${fromDate}`;
      if (instrumentKey === 'NSE_EQ|INE002A01018') {
        console.log(`[RELIANCE daily] Fallback URL: ${BASE_URL}${fallbackPath}`);
        console.log(`[RELIANCE daily] toDate=${toDate} fromDate=${fromDate}`);
      }
      const candles = stripPartialTodayDaily(await upstoxRequest(fallbackPath));
      lastDailyIntervalUsed = 'day/1';
      dailyCache.set(cacheKey, candles);
      return candles;
    }
    throw error;
  }
}

async function getIntradayCandles(instrumentKey) {
  const encodedKey = encodeInstrumentKeyForPath(instrumentKey);
  const preferredPath = `/historical-candle/intraday/${encodedKey}/minutes/5`;
  try {
    const candles = await upstoxRequest(preferredPath);
    lastIntradayIntervalUsed = 'minutes/5';
    return candles;
  } catch (error) {
    if (error.status === 400 && String(error.message).includes('Interval accepts')) {
      const oneMinute = await getIntradayOneMinuteCandles(instrumentKey);
      return aggregateToFiveMinute(oneMinute);
    }
    throw error;
  }
}

async function getIntradayOneMinuteCandles(instrumentKey) {
  const encodedKey = encodeInstrumentKeyForPath(instrumentKey);
  const oneMinutePath = `/historical-candle/intraday/${encodedKey}/minutes/1`;
  const candles = await upstoxRequest(oneMinutePath);
  lastIntradayIntervalUsed = 'minutes/1';
  return candles;
}

async function getHistorical5MinCandles(instrumentKey, fromDate = dateShift(14), toDate = dateShift(0)) {
  const cacheKey = `${getTodayIST()}::${instrumentKey}`;
  if (fiveMinHistoryCache.has(cacheKey)) {
    return fiveMinHistoryCache.get(cacheKey);
  }
  const encodedKey = encodeInstrumentKeyForPath(instrumentKey);
  const path = `/historical-candle/${encodedKey}/minutes/5/${toDate}/${fromDate}`;
  const candles = await upstoxRequest(path);
  fiveMinHistoryCache.set(cacheKey, candles);
  return candles;
}

function aggregateToFiveMinute(oneMinuteCandles) {
  const sorted = [...oneMinuteCandles].sort((a, b) => new Date(a[0]) - new Date(b[0]));
  const groups = new Map();
  for (const candle of sorted) {
    const ts = new Date(candle[0]);
    const bucketEpoch = Math.floor(ts.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000);
    const key = String(bucketEpoch);
    const open = Number(candle[1]);
    const high = Number(candle[2]);
    const low = Number(candle[3]);
    const close = Number(candle[4]);
    const volume = Number(candle[5] || 0);
    const oi = Number(candle[6] || 0);

    if (!groups.has(key)) {
      groups.set(key, [candle[0], open, high, low, close, volume, oi]);
    } else {
      const g = groups.get(key);
      g[2] = Math.max(g[2], high);
      g[3] = Math.min(g[3], low);
      g[4] = close;
      g[5] += volume;
      g[6] = oi;
    }
  }
  return Array.from(groups.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map((entry) => entry[1]);
}

function getLastIntervalsUsed() {
  return {
    daily: lastDailyIntervalUsed,
    intraday: lastIntradayIntervalUsed
  };
}

async function prewarmDailyCache(instruments) {
  for (const instrumentKey of instruments) {
    try {
      await getDailyCandles(instrumentKey);
    } catch (error) {
      console.error(`Prewarm failed for ${instrumentKey}:`, error.message);
    }
  }
}

function getCachedDaily(instrumentKey) {
  const raw = dailyCache.get(`${getTodayIST()}::${instrumentKey}`) || null;
  return raw ? stripPartialTodayDaily(raw) : null;
}

function getCached5Min(instrumentKey) {
  return fiveMinHistoryCache.get(`${getTodayIST()}::${instrumentKey}`) || null;
}

module.exports = {
  limiter,
  getDailyCandles,
  getIntradayCandles,
  getIntradayOneMinuteCandles,
  getHistorical5MinCandles,
  prewarmDailyCache,
  getCachedDaily,
  getCached5Min,
  dateShift,
  aggregateToFiveMinute,
  getLastIntervalsUsed
};
