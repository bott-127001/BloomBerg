import { NIFTY50_SYMBOLS } from '../nifty50Symbols';

const rank = (r) => {
  if (r.result === 'SELECTED') return 0;
  if (r.result === 'PASSED') return 1;
  if (r.f5Pass) return 2;
  if (r.f4Pass) return 3;
  if (r.f3Pass) return 4;
  if (r.f2Pass) return 5;
  if (r.f1Pass) return 6;
  return 7;
};

function resultClass(result) {
  if (result === 'SELECTED') return 'text-green-400 font-semibold';
  if (result === 'PASSED') return 'text-sky-400 font-medium';
  if (result && String(result).startsWith('FAILED')) return 'text-rose-300';
  return 'text-slate-400';
}

export default function ScanTable({ rows, pending, pendingBanner = 'Scan runs at 9:28 AM IST' }) {
  const sorted = pending ? [] : [...(rows || [])].sort((a, b) => rank(a) - rank(b));
  const icon = (v) => (v ? '✅' : '❌');

  const bodyRows = pending
    ? NIFTY50_SYMBOLS.map((symbol) => ({
        symbol,
        volRatio: null,
        atrPct: null,
        gapPct: null,
        gapAtrRatio: null,
        f1Pass: false,
        f2Pass: false,
        f3Pass: false,
        f4Pass: false,
        f5Pass: false,
        result: '—'
      }))
    : sorted;

  return (
    <div className="space-y-2">
      {pending && (
        <p className="text-sm text-slate-400 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2">{pendingBanner}</p>
      )}
      <div className="overflow-x-auto bg-slate-900 rounded-lg border border-slate-700">
        <table className="min-w-full text-xs md:text-sm">
          <thead className="bg-slate-800 text-slate-200">
            <tr>
              {['Symbol', 'Vol Ratio', 'ATR(5)%', 'Gap%', 'Gap/ATR Ratio', 'F1', 'F2', 'F3', 'F4', 'F5', 'Result'].map((h) => (
                <th key={h} className="px-3 py-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((r) => (
              <tr
                key={r.symbol}
                className={`border-t border-slate-800 ${!pending && r.result === 'SELECTED' ? 'border-l-4 border-l-green-500' : ''}`}
              >
                <td className="px-3 py-2">{r.symbol}</td>
                <td className="px-3 py-2">{r.volRatio?.toFixed?.(2) ?? (pending ? '—' : '-')}</td>
                <td className="px-3 py-2">{r.atrPct?.toFixed?.(2) ?? (pending ? '—' : '-')}</td>
                <td className="px-3 py-2">{r.gapPct?.toFixed?.(2) ?? (pending ? '—' : '-')}</td>
                <td className="px-3 py-2">{r.gapAtrRatio?.toFixed?.(2) ?? (pending ? '—' : '-')}</td>
                <td className="px-3 py-2">{pending ? '—' : icon(r.f1Pass)}</td>
                <td className="px-3 py-2">{pending ? '—' : icon(r.f2Pass)}</td>
                <td className="px-3 py-2">{pending ? '—' : icon(r.f3Pass)}</td>
                <td className="px-3 py-2">{pending ? '—' : icon(r.f4Pass)}</td>
                <td className="px-3 py-2">{pending ? '—' : icon(r.f5Pass)}</td>
                <td className={`px-3 py-2 ${pending ? 'text-slate-500' : resultClass(r.result)}`}>{r.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
