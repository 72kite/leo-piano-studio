/**
 * App.jsx — root component
 * Routes between pages via useViewStore.
 * CLIOverlay and ToastContainer are always mounted.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useViewStore, useSettingsStore, useAuthStore, useStatsStore } from './store/index.js';
import { computeConsistency } from './lib/computeConsistency.js';
import { TopNav }           from './components/nav/TopNav.jsx';
import { ModeToolbar }      from './components/typing/ModeToolbar.jsx';
import { TypingCanvas }     from './components/typing/TypingCanvas.jsx';
import { VirtualKeymap }    from './components/typing/VirtualKeymap.jsx';
import { ResultsScreen }    from './components/results/ResultsScreen.jsx';
import { SettingsPage }     from './components/settings/SettingsPage.jsx';
import { CLIOverlay }       from './components/settings/CLIOverlay.jsx';
import { RacePage }         from './components/race/RacePage.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';
import { Footer }           from './components/typing/Footer.jsx';
import { ToastContainer }   from './components/ui/Toast.jsx';
import { SessionLockOverlay } from './components/ui/SessionLockOverlay.jsx';
import { useSocket }        from './hooks/useSocket.js';
import { useTypingEngine }  from './hooks/useTypingEngine.js';
import { PianoMode }        from './components/piano/PianoMode.jsx';
import { MidiRacePage }     from './components/piano/MidiRacePage.jsx';
import { EducatorDashboard } from './components/educator/EducatorDashboard.jsx';
import { StatsPage }        from './components/stats/StatsPage.jsx';
import './App.css';

function TypingHub() {
  const settings    = useSettingsStore();
  const engine      = useTypingEngine();
  const isGuest     = useAuthStore(s => s.isGuest);
  const saveRun     = useStatsStore(s => s.saveRun);
  const [showResults, setShowResults] = useState(false);
  const [cliOpen, setCliOpen]         = useState(false);
  const [cliPrefill, setCliPrefill]   = useState('');
  const runSavedRef = useRef(false);

  // Open CLI on Escape (unless quickRestart is 'esc')
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && settings.quickRestart !== 'esc') {
        e.preventDefault();
        setCliOpen(o => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [settings.quickRestart]);

  const handleFinish = useCallback(() => {
    setShowResults(true);
    if (!runSavedRef.current && engine.status === 'finished' && !isGuest) {
      runSavedRef.current = true;
      saveRun({
        mode:        settings.mode,
        wpm:         engine.wpm,
        rawWpm:      engine.rawWpm,
        accuracy:    engine.accuracy,
        duration:    engine.getDuration(),
        timeLimit:   settings.mode === 'time'  ? settings.timeLimit : undefined,
        wordCount:   settings.mode === 'words' ? settings.wordCount : undefined,
        language:    settings.language,
        consistency: computeConsistency(engine.wordBursts),
      });
    }
  }, [engine, isGuest, saveRun, settings.mode, settings.timeLimit, settings.wordCount, settings.language]);

  const handleRestart = useCallback(() => {
    setShowResults(false);
    runSavedRef.current = false;
    engine.reset();
  }, [engine]);

  const openCLI = (key) => {
    setCliPrefill(key || '');
    setCliOpen(true);
  };

  return (
    <div className="typing-hub">
      <ModeToolbar />

      {showResults ? (
        <ResultsScreen
          wpm={engine.wpm}
          rawWpm={engine.rawWpm}
          accuracy={engine.accuracy}
          duration={engine.getDuration()}
          mode={settings.mode}
          timeLimit={settings.timeLimit}
          wordCount={settings.wordCount}
          wordBursts={engine.wordBursts}
          keystrokes={engine.getKeystrokes()}
          status={engine.status}
          failReason={engine.failReason}
          onRestart={handleRestart}
          onNext={handleRestart}
        />
      ) : (
        <>
          {/* Live stats are hidden while actively typing — deferred to results */}
          {engine.status === 'idle' && settings.mode === 'time' && (
            <div className="pre-stats">
              <span className="pre-stat-val">{settings.timeLimit}<span className="pre-stat-unit">s</span></span>
            </div>
          )}

          <TypingCanvas engine={engine} onFinish={handleFinish} />
          <VirtualKeymap nextChar={engine.words[engine.wordIdx]?.[engine.charIdx] ?? ' '} />
        </>
      )}

      <CLIOverlay
        open={cliOpen}
        onClose={() => setCliOpen(false)}
        prefillKey={cliPrefill}
      />
    </div>
  );
}

export default function App() {
  const page     = useViewStore(s => s.page);
  const settings = useSettingsStore();

  // Apply settings on boot
  useEffect(() => { settings.applyAll(); }, []);

  // Connect once, app-wide — a session-lock broadcast (or a race invite,
  // eventually) needs to reach a student wherever they are, not just while
  // they happen to be on Race/Educator Dashboard (the only two places that
  // used to call this). RacePage/EducatorDashboard's own useSocket() calls
  // are now redundant but harmless — the connection is a module-level
  // singleton, so they just get the same one back.
  useSocket();

  const pages = {
    type    : <TypingHub />,
    race    : <RacePage />,
    piano   : <PianoMode />,
    midirace: <MidiRacePage />,
    settings: <SettingsPage onOpenCLI={(key) => {/* bubble to hub if needed */}} />,
    login   : <LoginPage />,
    educator: <EducatorDashboard />,
    register: <RegisterPage />,
    stats   : <StatsPage />,
  };

  return (
    <div className="app-root">
      <TopNav />
      <main className={`app-main ${page === 'piano' || page === 'midirace' ? 'app-main-wide' : ''}`} id="page-root">
        {pages[page] || pages.type}
      </main>
      <Footer />
      <ToastContainer />
      <SessionLockOverlay />
    </div>
  );
}
