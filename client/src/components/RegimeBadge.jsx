function regimeLabel(regime) {
  if (!regime || regime === 'PENDING') return 'PENDING';
  return regime.replace(/_/g, ' ');
}

export default function RegimeBadge({ regime }) {
  const map = {
    HIGH_VOL: 'bg-red-900/50 text-red-200',
    LOW_VOL: 'bg-blue-900/50 text-blue-200',
    PENDING: 'bg-slate-700 text-slate-200'
  };
  const key = regime && regime !== 'PENDING' ? regime : 'PENDING';
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${map[key] || map.PENDING}`}>{regimeLabel(regime)}</span>
  );
}
