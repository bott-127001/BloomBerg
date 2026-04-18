export default function HistoryTable({ rows }) {
  return (
    <div className="overflow-x-auto bg-slate-900 rounded-lg border border-slate-700">
      <table className="min-w-full text-xs md:text-sm">
        <thead className="bg-slate-800 text-slate-200">
          <tr>
            {['Date','Stock','Direction','Entry','TP','SL','Regime','Status'].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r) => (
            <tr key={r.date} className="border-t border-slate-800">
              <td className="px-3 py-2">{r.date}</td>
              <td className="px-3 py-2">{r.stock || '-'}</td>
              <td className={`px-3 py-2 ${r.signal === 'LONG' ? 'text-green-300' : r.signal === 'SHORT' ? 'text-red-300' : 'text-slate-400'}`}>{r.signal || 'NO_TRADE'}</td>
              <td className="px-3 py-2">{r.entryPrice?.toFixed?.(2) ?? '-'}</td>
              <td className="px-3 py-2">{r.tpPrice?.toFixed?.(2) ?? '-'}</td>
              <td className="px-3 py-2">{r.slPrice?.toFixed?.(2) ?? '-'}</td>
              <td className="px-3 py-2">{r.regime || '-'}</td>
              <td className="px-3 py-2">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
