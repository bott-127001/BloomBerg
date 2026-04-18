import RegimeBadge from './RegimeBadge';

export default function SignalCard({ today }) {
  if (!today || today.status === 'pending') {
    return (
      <div className="bg-slate-800 text-slate-200 p-3 md:p-5 rounded-lg border border-slate-700">
        <p className="text-xs md:text-sm uppercase tracking-wide text-slate-400">Today's signal</p>
        <p className="text-sm md:text-base mt-1">Pending. This card will show today's selected stock and direction after scan.</p>
      </div>
    );
  }

  if (today.status === 'FAILED') {
    return (
      <div className="bg-red-900/40 text-red-200 p-3 md:p-5 rounded-lg border border-red-800/60">
        <p className="text-xs md:text-sm uppercase tracking-wide text-red-300">Today's signal</p>
        <p className="text-sm md:text-base mt-1">Scan failed: {today.errorMessage}</p>
      </div>
    );
  }

  if (today.signal === 'NO_TRADE') {
    return (
      <div className="bg-yellow-900/40 text-yellow-200 p-3 md:p-5 rounded-lg border border-yellow-800/60">
        <p className="text-xs md:text-sm uppercase tracking-wide text-yellow-300">Today's signal</p>
        <p className="text-sm md:text-base mt-1">No qualifying trade today.</p>
      </div>
    );
  }

  const color = today.signal === 'LONG' ? 'bg-green-900/30 text-green-200' : 'bg-red-900/30 text-red-200';

  return (
    <div className={`p-3 md:p-5 rounded-lg border ${today.signal === 'LONG' ? 'border-green-700/40' : 'border-red-700/40'} ${color}`}>
      <p className="text-xs md:text-sm uppercase tracking-wide opacity-80">Today's signal</p>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs md:text-sm opacity-80 mt-1">{today.stock}</div>
          <div className="text-xl md:text-2xl font-bold">{today.signal}</div>
        </div>
        <RegimeBadge regime={today.regime} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mt-3 md:mt-4 text-xs md:text-sm">
        <div>Entry: {today.entryPrice?.toFixed?.(2) ?? '-'}</div>
        <div>TP: {today.tpPrice?.toFixed?.(2) ?? '-'}</div>
        <div>SL: {today.slPrice?.toFixed?.(2) ?? '-'}</div>
        <div>VIX: {today.vixUsed?.toFixed?.(2) ?? '-'}</div>
      </div>
    </div>
  );
}
