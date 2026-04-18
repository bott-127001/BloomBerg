function evaluateFilters(input) {
  const result = {
    f1Pass: false,
    f2Pass: false,
    f3Pass: false,
    f4Pass: false,
    f5Pass: false,
    allPass: false,
    failedAt: 'F1'
  };

  if (input.volRatio >= 1.5) {
    result.f1Pass = true;
  } else {
    return result;
  }

  const atrThreshold = input.regime === 'HIGH_VOL' ? 2.5 : 1.75;
  if (input.atrPct >= atrThreshold) {
    result.f2Pass = true;
  } else {
    result.failedAt = 'F2';
    return result;
  }

  if (Math.abs(input.gapPct) >= 0.5) {
    result.f3Pass = true;
  } else {
    result.failedAt = 'F3';
    return result;
  }

  if (
    input.gapDirection &&
    input.gapDirection === input.candle915Direction &&
    input.candle915Direction === input.niftyDirection &&
    input.candle915Direction !== 'DOJI'
  ) {
    result.f4Pass = true;
  } else {
    result.failedAt = 'F4';
    return result;
  }

  if (input.candle920Direction === input.gapDirection) {
    result.f5Pass = true;
    result.allPass = true;
    result.failedAt = null;
    return result;
  }

  result.failedAt = 'F5';
  return result;
}

module.exports = { evaluateFilters };
