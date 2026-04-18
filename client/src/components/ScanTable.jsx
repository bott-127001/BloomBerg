import { NIFTY50_SYMBOLS } from '../nifty50Symbols';

const passCount = (r) => [r.f1Pass, r.f2Pass, r.f3Pass, r.f4Pass, r.f5Pass].filter(Boolean).length;

const eligibilityScore = (r) => {
  const passes = passCount(r);
  const gapAtr = Number(r.gapAtrRatio || 0);
  const volRatio = Number(r.volRatio || 0);
  const absGap = Math.abs(Number(r.gapPct || 0));
  // Weighted to favor deeper filter progress first, then quality metrics.
  return passes * 100 + gapAtr * 10 + volRatio * 2 + absGap;
};

const compareRows = (a, b) => {
  if (a.result === 'SELECTED' && b.result !== 'SELECTED') return -1;
  if (b.result === 'SELECTED' && a.result !== 'SELECTED') return 1;

  const aPass = passCount(a);
  const bPass = passCount(b);
  if (aPass !== bPass) return bPass - aPass;

  if (aPass === 5 && bPass === 5) {
    const aGapAtr = Number(a.gapAtrRatio || 0);
    const bGapAtr = Number(b.gapAtrRatio || 0);
    if (aGapAtr !== bGapAtr) return bGapAtr - aGapAtr;
  }

  const aScore = eligibilityScore(a);
  const bScore = eligibilityScore(b);
  if (aScore !== bScore) return bScore - aScore;

  return String(a.symbol || '').localeCompare(String(b.symbol || ''));
};

function resultClass(result) {
  if (result === 'SELECTED') return 'text-green-400 font-semibold';
  if (result === 'PASSED') return 'text-sky-400 font-medium';
  if (result && String(result).startsWith('FAILED')) return 'text-rose-300';
  return 'text-slate-400';
}

export default function ScanTable({ rows, pending, pendingBanner = 'Scan runs at 9:28 AM IST' }) {
  const sorted = pending ? [] : [...(rows || [])].sort(compareRows);
  const factorIcon = (v) =>
    v ? (
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] border border-emerald-500/40"
        title="Passed"
      >
        ✓
      </span>
    ) : (
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/15 text-rose-300 text-[10px] border border-rose-500/30"
        title="Failed"
      >
        ✕
      </span>
    );

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
        <p className="text-xs md:text-sm text-slate-400 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2">{pendingBanner}</p>
      )}
      <div className="overflow-x-auto bg-slate-900 rounded-lg border border-slate-700">
        {!pending && bodyRows.length > 0 && (
          <div className="px-3 py-2 text-[11px] md:text-xs text-slate-300 border-b border-slate-800 bg-slate-800/50">
            Top row is your highest-eligibility trade candidate for today.
          </div>
        )}
        <table className="min-w-full text-[11px] md:text-sm">
          <thead className="bg-slate-800 text-slate-200">
            <tr>
              {['Symbol', 'Vol Ratio', 'ATR(5)%', 'Gap%', 'Gap/ATR Ratio', 'F1', 'F2', 'F3', 'F4', 'F5', 'Result'].map((h) => (
                <th key={h} className="px-2 md:px-3 py-1.5 md:py-2 text-left whitespace-nowrap">
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
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap">{r.symbol}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2">{r.volRatio?.toFixed?.(2) ?? (pending ? '—' : '-')}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2">{r.atrPct?.toFixed?.(2) ?? (pending ? '—' : '-')}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2">{r.gapPct?.toFixed?.(2) ?? (pending ? '—' : '-')}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2">{r.gapAtrRatio?.toFixed?.(2) ?? (pending ? '—' : '-')}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2">{pending ? '—' : factorIcon(r.f1Pass)}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2">{pending ? '—' : factorIcon(r.f2Pass)}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2">{pending ? '—' : factorIcon(r.f3Pass)}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2">{pending ? '—' : factorIcon(r.f4Pass)}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2">{pending ? '—' : factorIcon(r.f5Pass)}</td>
                <td className={`px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap ${pending ? 'text-slate-500' : resultClass(r.result)}`}>{r.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
