function getISTDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  }).formatToParts(date);

  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday
  };
}

function getTodayIST() {
  return getISTDateParts().date;
}

function isWeekendIST(date = new Date()) {
  const weekday = getISTDateParts(date).weekday;
  return weekday === 'Sat' || weekday === 'Sun';
}

function isWithinISTRange(startHour, startMinute, endHour, endMinute, date = new Date()) {
  const p = getISTDateParts(date);
  const current = p.hour * 60 + p.minute;
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return current >= start && current <= end;
}

module.exports = { getISTDateParts, getTodayIST, isWeekendIST, isWithinISTRange };
