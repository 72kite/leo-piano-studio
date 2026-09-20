/**
 * StatsPage — profile/stats history view
 * Summary tiles + WPM trend chart + a paginated run history table, all
 * backed by /api/stats/*. Guests have nothing server-side to show.
 */
import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useAuthStore, useStatsStore } from '../../store/index.js';
import './StatsPage.css';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

function TrendChart({ trend }) {
  if (trend.length < 2) return null;

  const style = getComputedStyle(document.documentElement);
  const acc   = style.getPropertyValue('--acc').trim() || '#e8d44d';
  const sub   = style.getPropertyValue('--sub').trim() || 'rgba(255,255,255,.35)';
  const surf2 = style.getPropertyValue('--surf2').trim() || '#1e1e24';

  const data = {
    labels: trend.map((_, i) => i + 1),
    datasets: [{
      data: trend.map(t => t.wpm),
      borderColor: acc,
      backgroundColor: `${acc}18`,
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: acc,
      tension: 0.35,
      fill: true,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      // Explicit, not just "nothing registers Legend" — ResultsScreen.jsx
      // registers Legend globally (Chart.js's registry is a shared
      // singleton across the whole app), so once a user has visited
      // Results this chart would otherwise inherit a legend showing the
      // dataset's (unset) label as "undefined".
      legend: { display: false },
      tooltip: {
        callbacks: { label: ctx => `${ctx.parsed.y} wpm` },
        backgroundColor: surf2, titleColor: sub, bodyColor: acc,
        borderColor: sub, borderWidth: 1, padding: 8, cornerRadius: 6,
      },
    },
    scales: {
      x: { display: false },
      y: { min: 0, ticks: { color: sub, font: { size: 9 }, maxTicksLimit: 5 }, grid: { color: 'rgba(255,255,255,.05)' }, border: { color: 'transparent' } },
    },
  };

  return (
    <div className="stats-chart-wrap">
      <Line data={data} options={options} />
    </div>
  );
}

function SignInGate() {
  return (
    <div className="stats-gate">
      <div className="stats-gate-title">Sign in to track your stats</div>
      <div className="stats-gate-sub">Guest runs aren't saved — create an account to build up a run history and WPM trend.</div>
    </div>
  );
}

const PAGE_SIZE = 20;

export function StatsPage() {
  const isGuest       = useAuthStore(s => s.isGuest);
  const { summary, runs, runsTotal, loading, fetchSummary, fetchRuns } = useStatsStore();
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (isGuest) return;
    fetchSummary();
  }, [isGuest]);

  useEffect(() => {
    if (isGuest) return;
    fetchRuns(PAGE_SIZE, page * PAGE_SIZE);
  }, [isGuest, page]);

  if (isGuest) return <SignInGate />;

  const tiles = [
    { label: 'Total runs',   value: summary?.totalRuns ?? '—' },
    { label: 'Best WPM',     value: summary?.bestWpm ?? '—', accent: true },
    { label: 'Avg WPM',      value: summary?.avgWpm ?? '—' },
    { label: 'Avg accuracy', value: summary != null ? `${summary.avgAccuracy}%` : '—' },
  ];

  return (
    <div className="stats-page">
      <div className="stats-header">
        <div className="stats-title">Stats</div>
        <div className="stats-sub">Your typing-hub run history</div>
      </div>

      <div className="stats-tiles">
        {tiles.map(t => (
          <div key={t.label} className="stats-tile">
            <div className="stats-tile-lbl">{t.label}</div>
            <div className={`stats-tile-val ${t.accent ? 'accent' : ''}`}>{t.value}</div>
          </div>
        ))}
      </div>

      {summary?.trend?.length > 1 && <TrendChart trend={summary.trend} />}

      {!loading && summary?.totalRuns === 0 ? (
        <div className="stats-empty">No runs yet — finish a typing test to start building your history.</div>
      ) : (
        <table className="stats-table">
          <thead>
            <tr>{['Date', 'Mode', 'WPM', 'Accuracy', 'Consistency'].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {runs.map(r => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td>{r.mode}</td>
                <td className="stats-td-wpm">{r.wpm}</td>
                <td>{r.accuracy.toFixed(1)}%</td>
                <td>{r.consistency != null ? `${r.consistency}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {runsTotal > PAGE_SIZE && (
        <div className="stats-pager">
          <button className="stats-page-btn" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← newer</button>
          <button className="stats-page-btn" disabled={(page + 1) * PAGE_SIZE >= runsTotal} onClick={() => setPage(p => p + 1)}>older →</button>
        </div>
      )}
    </div>
  );
}
