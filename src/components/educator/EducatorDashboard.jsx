/**
 * EducatorDashboard — React wrapper around teacher-portal functionality
 *
 * Gated behind role === 'educator'. Guests and students see a lock screen.
 *
 * Features:
 *   - Roster: real aggregate stats per student (join code + best/avg WPM,
 *     avg accuracy, last active), backed by /api/teacher/roster
 *   - Focus controls (mode locks, screen lock toggle, chat disable) — still
 *     a stub broadcast (no server-side session enforcement exists yet)
 *   - Progress reports (searchable per-student table, CSV export) — same
 *     real roster data as above
 *   - Account generator (bulk credential creation) — still a client-only
 *     preview stub, not wired to a backend endpoint
 */
import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuthStore, useTeacherStore } from '../../store/index.js';
import { useSocket }    from '../../hooks/useSocket.js';
import { toast }        from '../ui/Toast.jsx';
import './EducatorDashboard.css';

function relativeTime(ts) {
  if (!ts) return '—';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Access gate ───────────────────────────────────────────────
function AccessGate() {
  return (
    <div className="edu-gate">
      <div className="edu-gate-icon">🏫</div>
      <div className="edu-gate-title">Educator Access Only</div>
      <div className="edu-gate-sub">
        This dashboard is available to educator accounts only.
        Register with the Educator role to unlock classroom management.
      </div>
    </div>
  );
}

// ── Tab nav ───────────────────────────────────────────────────
const TABS = ['Roster', 'Focus', 'Reports', 'Accounts'];

// ── Roster tab — real per-student aggregate stats + the join code
// students use to appear here (Settings → Classroom on their side). ──
function RosterTab({ joinCode, students, loading }) {
  const withRuns    = students.filter(s => s.totalRuns > 0);
  const classAvgWpm = withRuns.length
    ? Math.round(withRuns.reduce((a, s) => a + s.avgWpm, 0) / withRuns.length) : 0;
  const classAvgAcc = withRuns.length
    ? Math.round((withRuns.reduce((a, s) => a + s.avgAccuracy, 0) / withRuns.length) * 10) / 10 : 0;

  return (
    <div className="edu-tab-content">
      <div className="edu-join-code-card">
        <div className="edu-join-code-label">Class join code</div>
        <div className="edu-join-code-value">{joinCode || '······'}</div>
        <div className="edu-join-code-hint">Students enter this under Settings → Classroom to appear on your roster.</div>
      </div>

      <div className="edu-tiles">
        {[
          { label:'Students',      value:students.length, unit:'',  cls:'t1' },
          { label:'Class avg WPM', value:classAvgWpm,      unit:'',  cls:'t2' },
          { label:'Class avg acc', value:classAvgAcc,      unit:'%', cls:'t3' },
        ].map(t => (
          <div key={t.label} className={`edu-tile ${t.cls}`}>
            <div className="edu-tile-lbl">{t.label}</div>
            <div className="edu-tile-val">{t.value}<span className="edu-tile-unit">{t.unit}</span></div>
          </div>
        ))}
      </div>

      <table className="edu-table">
        <thead>
          <tr>{['Student','Runs','Best WPM','Avg WPM','Avg Acc','Last active'].map(h=><th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {students.map(s => (
            <tr key={s.userId}>
              <td className="edu-td-name">{s.username}</td>
              <td>{s.totalRuns}</td>
              <td className="edu-td-wpm">{s.totalRuns ? s.bestWpm : '—'}</td>
              <td className="edu-td-wpm">{s.totalRuns ? s.avgWpm : '—'}</td>
              <td className="edu-td-acc">{s.totalRuns ? `${s.avgAccuracy.toFixed(1)}%` : '—'}</td>
              <td>{relativeTime(s.lastRunAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && students.length === 0 && (
        <div className="edu-empty-hint">No students yet — share the join code above to add your roster.</div>
      )}
    </div>
  );
}

// ── Focus controls tab ────────────────────────────────────────
// ids match server/lib/validation.js's LOCKABLE_MODES exactly — the server
// rejects anything else, so these two lists must stay in sync.
const ALL_MODES = [
  { id: 'time',  label: 'time'      },
  { id: 'words', label: 'words'     },
  { id: 'quote', label: 'quote'     },
  { id: 'zen',   label: 'zen'       },
  { id: 'funbox',label: 'funbox'    },
  { id: 'piano', label: '🎹 piano'  },
  { id: 'race',  label: '🏎 race'   },
];

function FocusTab({ emit }) {
  const [lockedModes, setLockedModes] = useState(['piano','race','funbox']);
  const [screenLock, setScreenLock]   = useState(false);
  const [maskNames,  setMaskNames]    = useState(true);
  const [chatOff,    setChatOff]      = useState(true);

  const broadcast = () => {
    emit('session:set_modes', { lockedModes, screenLocked: screenLock, maskUsernames: maskNames, chatDisabled: chatOff });
    toast(`Broadcast: ${lockedModes.length} modes locked`, 'success');
  };

  function Toggle({ value, onChange, label }) {
    return (
      <label className="edu-toggle-row">
        <span>{label}</span>
        <label className="edu-toggle">
          <input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)} />
          <span className="edu-toggle-slider" />
        </label>
      </label>
    );
  }

  return (
    <div className="edu-tab-content">
      <div className="edu-card">
        <div className="edu-card-head">Mode Locks <span className="edu-card-hint">click to toggle</span></div>
        <div className="mode-lock-chips">
          {ALL_MODES.map(({ id, label }) => (
            <button
              key={id}
              className={`mode-chip ${lockedModes.includes(id) ? 'chip-locked' : ''}`}
              onClick={() => setLockedModes(l => l.includes(id) ? l.filter(x=>x!==id) : [...l,id])}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="edu-card">
        <div className="edu-card-head">Session Settings</div>
        <Toggle value={screenLock} onChange={setScreenLock} label="Lock all student screens" />
        <Toggle value={maskNames}  onChange={setMaskNames}  label="Mask usernames in global races" />
        <Toggle value={chatOff}    onChange={setChatOff}    label="Disable in-game chat" />
      </div>
      <button className="edu-btn primary wide" onClick={broadcast}>Broadcast to class</button>
    </div>
  );
}

// ── CSV export ──────────────────────────────────────────────
function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function studentsToCSV(students) {
  const header = ['Student', 'Runs', 'Best WPM', 'Avg WPM', 'Avg Accuracy'];
  const rows = students.map(s => [s.username, s.totalRuns, s.bestWpm, s.avgWpm, s.avgAccuracy]);
  return [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');
}

function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Reports tab ───────────────────────────────────────────────
function ReportsTab({ students }) {
  const [filter, setFilter] = useState('');
  const shown = students.filter(s => !filter || s.username.toLowerCase().includes(filter.toLowerCase()));

  const exportCSV = () => {
    downloadCSV(`leo-class-report-${new Date().toISOString().slice(0, 10)}.csv`, studentsToCSV(shown));
    toast(`Exported ${shown.length} student${shown.length === 1 ? '' : 's'} to CSV`, 'success');
  };

  return (
    <div className="edu-tab-content">
      <div className="edu-card">
        <div className="edu-card-head" style={{justifyContent:'space-between',display:'flex',alignItems:'center'}}>
          <span>Student Performance</span>
          <input className="edu-search" placeholder="search…" value={filter} onChange={e=>setFilter(e.target.value)} />
        </div>
        <table className="edu-table">
          <thead>
            <tr>{['Student','Runs','Best WPM','Avg WPM','Avg Accuracy'].map(h=><th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map(s=>(
              <tr key={s.userId}>
                <td>{s.username}</td>
                <td>{s.totalRuns}</td>
                <td className="edu-td-wpm">{s.totalRuns ? s.bestWpm : '—'}</td>
                <td className="edu-td-wpm">{s.totalRuns ? s.avgWpm : '—'}</td>
                <td>{s.totalRuns ? `${s.avgAccuracy.toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="edu-export-row">
          <button className="edu-btn" onClick={exportCSV} disabled={shown.length === 0}>↓ Export CSV</button>
        </div>
      </div>
    </div>
  );
}

// ── Account generator tab ─────────────────────────────────────
function accountsToCSV(accounts) {
  const header = ['Username', 'Password'];
  const rows = accounts.map(a => [a.username, a.password]);
  return [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');
}

function AccountsTab() {
  const createBulkAccounts = useTeacherStore(s => s.createBulkAccounts);
  const fetchRoster        = useTeacherStore(s => s.fetchRoster);
  const [count,    setCount]    = useState(10);
  const [prefix,   setPrefix]   = useState('student');
  const [creating, setCreating] = useState(false);
  const [created,  setCreated]  = useState([]); // real accounts just created — credentials shown once

  const create = async () => {
    setCreating(true);
    const result = await createBulkAccounts(count, prefix);
    setCreating(false);
    if (result.ok) {
      setCreated(result.accounts);
      fetchRoster(); // new students should show up on Roster/Reports immediately
      toast(`Created ${result.accounts.length} account${result.accounts.length === 1 ? '' : 's'}`, 'success');
    } else {
      toast(result.error === 'RATE_LIMIT' ? 'Too many requests — try again shortly' : 'Could not create accounts', 'error');
    }
  };

  const exportCSV = () => {
    downloadCSV(`leo-new-accounts-${new Date().toISOString().slice(0, 10)}.csv`, accountsToCSV(created));
  };

  return (
    <div className="edu-tab-content">
      <div className="edu-card">
        <div className="edu-card-head">Generate Student Accounts</div>
        <div className="edu-gen-form">
          <label className="edu-gen-field">
            <span>Count</span>
            <input type="number" value={count} min={1} max={100} onChange={e => setCount(Number(e.target.value))} />
          </label>
          <label className="edu-gen-field">
            <span>Prefix</span>
            <input type="text" value={prefix} onChange={e => setPrefix(e.target.value)} />
          </label>
        </div>
        <div className="edu-gen-actions">
          <button className="edu-btn primary" onClick={create} disabled={creating || count < 1}>
            {creating ? 'Creating…' : `Create ${count} Account${count === 1 ? '' : 's'}`}
          </button>
        </div>
        {created.length > 0 && (
          <>
            <div className="gen-preview">
              {created.slice(0, 8).map((a, i) => (
                <div key={i} className="gen-row">
                  <span className="gen-user">{a.username}</span>
                  <span className="gen-pw">{a.password}</span>
                </div>
              ))}
              {created.length > 8 && <div className="gen-more">…and {created.length - 8} more</div>}
            </div>
            <div className="edu-export-row" style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              <button className="edu-btn" onClick={exportCSV}>↓ Export CSV</button>
              <span className="edu-card-hint">Passwords are shown once — save them now.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────
export function EducatorDashboard() {
  const { user, isGuest } = useAuthStore();
  const { emit }          = useSocket();
  const [tab, setTab]     = useState(0);
  const { joinCode, students, loading, fetchRoster } = useTeacherStore();

  const isEducator = !isGuest && user?.role === 'educator';

  useEffect(() => {
    if (isEducator) fetchRoster();
  }, [isEducator, fetchRoster]);

  // Role gate
  if (!isEducator) {
    return <AccessGate />;
  }

  return (
    <div className="educator-dashboard">
      <div className="edu-header">
        <div>
          <div className="edu-title">Teacher Portal</div>
          <div className="edu-sub">Classroom management · {user.username}</div>
        </div>
        <button className="edu-btn" onClick={fetchRoster} disabled={loading} title="Refresh roster">
          <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Tab navigation */}
      <div className="edu-tabs">
        {TABS.map((t,i) => (
          <button key={t} className={`edu-tab ${tab===i?'edu-tab-on':''}`} onClick={()=>setTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 0 && <RosterTab joinCode={joinCode} students={students} loading={loading} />}
      {tab === 1 && <FocusTab emit={emit} />}
      {tab === 2 && <ReportsTab students={students} />}
      {tab === 3 && <AccountsTab />}
    </div>
  );
}
