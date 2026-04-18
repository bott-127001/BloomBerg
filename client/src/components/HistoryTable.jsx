export default function HistoryTable({ rows }) {
  return (
    <div className="overflow-x-auto bg-slate-900 rounded-lg border border-slate-700">
      <table className="min-w-full text-[11px] md:text-sm">
        <thead className="bg-slate-800 text-slate-200">
          <tr>
            {['Date','Stock','Direction','Entry','TP','SL','Regime','Status'].map((h) => <th key={h} className="px-2 md:px-3 py-1.5 md:py-2 text-left whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r) => (
            <tr key={r.date} className="border-t border-slate-800">
              <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap">{r.date}</td>
              <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap">{r.stock || '-'}</td>
              <td className={`px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap ${r.signal === 'LONG' ? 'text-green-300' : r.signal === 'SHORT' ? 'text-red-300' : 'text-slate-400'}`}>{r.signal || 'NO_TRADE'}</td>
              <td className="px-2 md:px-3 py-1.5 md:py-2">{r.entryPrice?.toFixed?.(2) ?? '-'}</td>
              <td className="px-2 md:px-3 py-1.5 md:py-2">{r.tpPrice?.toFixed?.(2) ?? '-'}</td>
              <td className="px-2 md:px-3 py-1.5 md:py-2">{r.slPrice?.toFixed?.(2) ?? '-'}</td>
              <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap">{r.regime || '-'}</td>
              <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
