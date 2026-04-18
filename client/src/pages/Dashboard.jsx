import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SignalCard from '../components/SignalCard';
import ScanTable from '../components/ScanTable';
import HistoryTable from '../components/HistoryTable';
import RegimeBadge from '../components/RegimeBadge';

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);
}

function inWindow(startH, startM, endH, endM) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const now = Number(map.hour) * 60 + Number(map.minute);
  return now >= startH * 60 + startM && now <= endH * 60 + endM;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [clock, setClock] = useState(formatClock());
  const [indices, setIndices] = useState({ nifty50: null, indiaVix: null, marketOpen: false });

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: 'include', ...opts });
    if (res.status === 401) {
      navigate('/login');
      return null;
    }
    return res.json();
  }

  async function loadToday() {
    const data = await api('/api/signal/today');
    if (data) setToday(data);
  }

  async function loadHistory() {
    const data = await api('/api/signal/history?limit=30');
    if (data) setHistory(data);
  }

  async function loadIndices() {
    const data = await api('/api/market/indices');
    if (data) setIndices(data);
  }

  useEffect(() => {
    loadToday();
    loadHistory();
    loadIndices();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setClock(formatClock()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (inWindow(9, 0, 10, 0)) loadToday();
      if (inWindow(9, 0, 15, 30)) loadIndices();
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const vixDecisive = useMemo(() => {
    if (!today || typeof today.vixUsed !== 'number') return false;
    return today.vixUsed < 15 || today.vixUsed > 20;
  }, [today]);

  const tiebreakerBand = useMemo(() => {
    if (!today || typeof today.vixUsed !== 'number') return 'pending';
    if (today.vixUsed < 15 || today.vixUsed > 20) return 'decisive';
    return 'active';
  }, [today]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 space-y-5">
      <header className="flex items-center justify-between gap-3 bg-slate-900 border border-slate-700 rounded-lg p-4">
        <div className="text-xl font-bold">Nifty Signal</div>
        <div className="text-sm text-slate-200">{clock} IST</div>
        <button onClick={logout} className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded">Logout</button>
      </header>

      <section className="grid md:grid-cols-4 gap-4 bg-slate-900 border border-slate-700 rounded-lg p-4">
        <div><p className="text-slate-400 text-xs">Nifty 50</p><p className="text-xl font-semibold">{indices.nifty50?.toFixed?.(2) ?? '-'}</p>{!indices.marketOpen && <p className="text-xs text-slate-500">Closed</p>}</div>
        <div><p className="text-slate-400 text-xs">India VIX</p><p className="text-xl font-semibold">{indices.indiaVix?.toFixed?.(2) ?? '-'}</p>{!indices.marketOpen && <p className="text-xs text-slate-500">Closed</p>}</div>
        <div><p className="text-slate-400 text-xs mb-1">Regime</p><RegimeBadge regime={today?.regime || 'PENDING'} /></div>
        <div
          className={
            tiebreakerBand === 'pending'
              ? 'opacity-70'
              : tiebreakerBand === 'decisive'
                ? 'opacity-60'
                : 'bg-yellow-500/10 border border-yellow-500/20 p-2 rounded'
          }
        >
          <p className="text-slate-400 text-xs">Avg ATR(5) of scan</p>
          <p className="text-xl font-semibold">{today?.avgAtrScan != null ? `${today.avgAtrScan.toFixed(2)}%` : '—'}</p>
          <p className="text-xs text-slate-400">Used for regime tiebreaker when VIX is 15–20</p>
          <p className="text-xs text-slate-400">
            {tiebreakerBand === 'pending' && 'Scan pending — tiebreaker applies after today’s run'}
            {tiebreakerBand === 'decisive' && 'Not used today (VIX is decisive)'}
            {tiebreakerBand === 'active' && 'Active tiebreaker — regime set by this value'}
          </p>
        </div>
      </section>

      <SignalCard today={today} />
      <ScanTable
        rows={today?.scanDetails || []}
        pending={
          !today ||
          today.status === 'pending' ||
          (today.status === 'FAILED' && !(today.scanDetails && today.scanDetails.length))
        }
        pendingBanner={
          today?.status === 'FAILED' && !(today.scanDetails && today.scanDetails.length)
            ? 'Scan failed before per-stock rows were available.'
            : 'Scan runs at 9:28 AM IST'
        }
      />
      <HistoryTable rows={history} />
    </div>
  );
}
