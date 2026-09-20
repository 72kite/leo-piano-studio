/**
 * ResultsScreen
 * Left: giant WPM + Accuracy numbers (accent yellow)
 * Right: Chart.js WPM line chart with error scatter
 * Below: secondary metrics grid + action row
 */
import { useMemo, useEffect } from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
  ScatterController,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { RotateCcw, RefreshCw, Camera } from 'lucide-react';
import { computeConsistency } from '../../lib/computeConsistency.js';
import './ResultsScreen.css';

// ScatterController backs the Errors dataset's `type: 'scatter'` below — the
// dev server tolerates the missing registration (something else happens to
// pull in Chart.js's full registry first), but a production build tree-shakes
// it away, and Chart.js throws synchronously on mount ("scatter" is not a
// registered controller) with no error boundary catching it — the entire
// results screen renders blank instead of just the chart failing.
ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend, ScatterController);

function WpmChart({ wordBursts, keystrokes }) {
  const { data, options } = useMemo(() => {
    const labels   = wordBursts.map((_, i) => i + 1);
    const wpmData  = wordBursts.map(b => b.wpm);

    // Map errors onto word-burst x-axis via time ratio
    const totalDuration = (keystrokes.at(-1)?.ts || 0) - (keystrokes[0]?.ts || 0);
    const errPoints = keystrokes
      .filter(k => !k.correct)
      .map(k => {
        const ratio = totalDuration > 0 ? (k.ts - keystrokes[0].ts) / totalDuration : 0;
        const xIdx  = ratio * (wordBursts.length - 1 || 1);
        return { x: xIdx + 1, y: 0 };
      });

    const style = getComputedStyle(document.documentElement);
    const acc   = style.getPropertyValue('--acc').trim()   || '#e8d44d';
    const err   = style.getPropertyValue('--err').trim()   || '#f87171';
    const sub   = style.getPropertyValue('--sub').trim()   || 'rgba(255,255,255,.35)';
    const surf2 = style.getPropertyValue('--surf2').trim() || '#1e1e24';

    const data = {
      labels,
      datasets: [
        {
          label: 'WPM',
          data: wpmData,
          borderColor: acc,
          backgroundColor: `${acc}18`,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: acc,
          tension: 0.35,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: 'Errors',
          data: errPoints,
          type: 'scatter',
          backgroundColor: err,
          pointRadius: 4,
          pointStyle: 'circle',
          showLine: false,
          yAxisID: 'y',
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => `Word ${ctx[0].label}`,
            label: ctx => ctx.dataset.label === 'WPM'
              ? `${ctx.parsed.y} wpm`
              : 'error',
          },
          backgroundColor: surf2,
          titleColor: sub,
          bodyColor: acc,
          borderColor: sub,
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          titleFont: { family: "'Space Mono', monospace", size: 10 },
          bodyFont:  { family: "'Space Mono', monospace", size: 12 },
        },
      },
      scales: {
        x: {
          ticks:  { color: sub, font: { family: "'Space Mono', monospace", size: 9 }, maxTicksLimit: 10 },
          grid:   { color: 'rgba(255,255,255,.05)' },
          border: { color: 'transparent' },
        },
        y: {
          min: 0,
          ticks:  { color: sub, font: { family: "'Space Mono', monospace", size: 9 }, maxTicksLimit: 6 },
          grid:   { color: 'rgba(255,255,255,.05)' },
          border: { color: 'transparent' },
        },
      },
    };

    return { data, options };
  }, [wordBursts, keystrokes]);

  if (!wordBursts.length) return null;

  return (
    <div className="results-chart-wrap">
      <Line data={data} options={options} />
    </div>
  );
}

export function ResultsScreen({ wpm, rawWpm, accuracy, duration, mode, timeLimit, wordCount, wordBursts, keystrokes, onRestart, onNext, status, failReason }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onRestart?.(); }
      if (e.key === 'Tab')   { e.preventDefault(); onNext?.(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onRestart, onNext]);

  const correct   = keystrokes.filter(k => k.correct).length;
  const incorrect = keystrokes.filter(k => !k.correct).length;
  const consistency = computeConsistency(wordBursts);

  return (
    <div className="results-screen" role="region" aria-label="Test results">
      {status === 'failed' && (
        <div className="fail-banner">test failed — {failReason || 'threshold not met'}</div>
      )}

      {/* ── Top section: hero + chart ── */}
      <div className="results-top">
        <div className="results-hero">
          <div className="hero-metric">
            <div className="hero-value accent">{wpm}</div>
            <div className="hero-label">wpm</div>
          </div>
          <div className="hero-metric">
            <div className="hero-value">{accuracy.toFixed(1)}%</div>
            <div className="hero-label">accuracy</div>
          </div>
        </div>
        <WpmChart wordBursts={wordBursts} keystrokes={keystrokes} />
      </div>

      {/* ── Secondary metrics grid ── */}
      <div className="results-grid">
        <div className="res-group">
          <div className="res-group-title">test</div>
          <div className="res-row"><span>mode</span><span className="rv">{mode}</span></div>
          {mode === 'time'  && <div className="res-row"><span>time</span><span className="rv">{timeLimit}s</span></div>}
          {mode === 'words' && <div className="res-row"><span>words</span><span className="rv">{wordCount}</span></div>}
          <div className="res-row"><span>duration</span><span className="rv">{duration}s</span></div>
        </div>
        <div className="res-group">
          <div className="res-group-title">raw performance</div>
          <div className="res-row"><span>raw wpm</span><span className="rv">{rawWpm}</span></div>
          <div className="res-row"><span>consistency</span><span className="rv">{consistency}%</span></div>
        </div>
        <div className="res-group">
          <div className="res-group-title">characters</div>
          <div className="res-row"><span>correct</span><span className="rv ok">{correct}</span></div>
          <div className="res-row"><span>incorrect</span><span className="rv err">{incorrect}</span></div>
          <div className="res-row"><span>total</span><span className="rv">{keystrokes.length}</span></div>
        </div>
      </div>

      {/* ── Action row ── */}
      <div className="results-actions">
        <button className="res-action" onClick={onNext}              title="Next test (Tab)">
          <RefreshCw size={16} />
        </button>
        <button className="res-action" onClick={onRestart}           title="Restart">
          <RotateCcw size={16} />
        </button>
        <button className="res-action" onClick={() => window.print()} title="Screenshot">
          <Camera size={16} />
        </button>
      </div>
      <div className="results-hint">tab → next · enter → restart</div>
    </div>
  );
}
