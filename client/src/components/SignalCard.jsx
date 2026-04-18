import RegimeBadge from './RegimeBadge';

export default function SignalCard({ today }) {
  if (!today || today.status === 'pending') {
    return <div className="bg-slate-800 text-slate-200 p-5 rounded-lg">Scan runs at 9:28 AM IST</div>;
  }

  if (today.status === 'FAILED') {
    return <div className="bg-red-900/40 text-red-200 p-5 rounded-lg">Scan failed: {today.errorMessage}</div>;
  }

  if (today.signal === 'NO_TRADE') {
    return <div className="bg-yellow-900/40 text-yellow-200 p-5 rounded-lg">No qualifying trade today</div>;
  }

  const color = today.signal === 'LONG' ? 'bg-green-900/30 text-green-200' : 'bg-red-900/30 text-red-200';

  return (
    <div className={`p-5 rounded-lg ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm opacity-80">{today.stock}</div>
          <div className="text-2xl font-bold">{today.signal}</div>
        </div>
        <RegimeBadge regime={today.regime} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
        <div>Entry: {today.entryPrice?.toFixed?.(2) ?? '-'}</div>
        <div>TP: {today.tpPrice?.toFixed?.(2) ?? '-'}</div>
        <div>SL: {today.slPrice?.toFixed?.(2) ?? '-'}</div>
        <div>VIX: {today.vixUsed?.toFixed?.(2) ?? '-'}</div>
      </div>
    </div>
  );
}
