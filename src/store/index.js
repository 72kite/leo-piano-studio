/**
 * Leo — Global State (Zustand)
 * Single source of truth for auth, settings, and view routing.
 * All mutations are synchronous and drive immediate reactive re-renders.
 */
import { create } from 'zustand';

// ── Word pools (moved here so stores can share) ───────────────
const WORDS_EN   = ["the","be","to","of","and","a","in","that","have","it","for","not","on","with","he","as","you","do","at","this","but","his","by","from","they","we","say","her","she","or","an","will","my","one","all","would","there","their","what","so","up","out","if","about","who","get","which","go","me","when","make","can","like","time","no","just","him","know","take","people","into","year","your","good","some","could","them","see","other","than","then","now","look","only","come","its","over","think","also","back","after","use","two","how","our","work","first","well","way","even","new","want","because","any","these","give","day","most","us","great","between","need","large","often","hand","high","place","hold","turn","here","why","help","put","different","away","again","off","play","small","number","always","move","live","show","try","change","point","found","study","still","learn","plant","cover","food","sun","far","sea","draw","left","late","run","while","press","close","night","real","life"];
export const WORDS_BRIT = ["colour","honour","favour","realise","analyse","centre","theatre","programme","defence","offence","licence","practise","neighbouring","travelling","cancelled","jewellery","grey","tyre","mould","plough"];
const WORDS_PY   = ["def","class","import","from","return","if","else","elif","for","while","try","except","with","as","lambda","yield","pass","break","continue","global","nonlocal","del","assert","raise","True","False","None","self","print","len","range","list","dict","tuple","set","str","int","float","bool"];
const WORDS_CPP  = ["auto","const","static","void","int","bool","float","class","struct","namespace","template","typename","virtual","override","inline","explicit","nullptr","constexpr","std","vector","string","map","set","pair","cout","return","if","else","for","while","switch","case","break","include"];
const WORDS_GO   = ["func","var","const","type","struct","interface","package","import","go","chan","select","defer","map","range","return","if","else","switch","for","break","continue","make","new","len","cap","append","nil","true","false","error","string","int","bool"];
const WORDS_RUST = ["fn","let","mut","const","struct","enum","impl","trait","use","mod","pub","match","if","else","loop","while","for","in","break","continue","return","move","ref","async","await","unsafe","Vec","String","Option","Result","println","unwrap"];
const WORDS_ES   = ["el","la","de","que","y","en","un","ser","se","no","haber","por","con","su","para","como","estar","tener","le","lo","todo","pero","mas","hacer","o","poder","decir","este","ir","otro","ver","cuando","querer","saber","si","llegar","pasar","deber","poner","parecer","quedar","creer","hablar","llevar","dejar","seguir","encontrar","llamar","venir","pensar","salir","volver","tomar","dar","conocer","vivir","sentir","tratar","mirar","contar","empezar","esperar","buscar","existir","entrar","trabajar","escribir","perder","producir","entender","pedir","recibir","recordar","terminar","permitir","aparecer","conseguir","comenzar","servir","sacar","necesitar","mantener","resultar","leer","caer","ciudad","agua","noche","vida","mano","mundo","tiempo","casa","hombre","mujer","dia","cosa","parte","lugar","vez","forma","trabajo","punto","bien","grande","mismo","nuevo","solo","cada","otro","mucho","muy","poco","mas","ya","ahora","despues","antes","siempre","nunca","tambien","sino","aunque","mientras","donde","cuando","como","porque","todo","nada","algo","alguien","nadie","aqui","alla","entonces","sin","sobre","bajo","entre","hasta","desde"];
const WORDS_AR   = ["في","من","إلى","على","هو","كان","قال","أن","لا","هذا","مع","ما","هي","كل","لم","يكون","له","قد","عن","بعد","أو","كما","لكن","بين","إذا","كانت","هذه","أي","ذلك","فقد","بل","حتى","عند","منذ","قبل","حين","أنه","غير","أما","رغم","وقد","كيف","لقد","ثم","أيضا","أكثر","يمكن","حول","أول","دون","خلال","وهو","نحو","ربما","وكان","قول","أنا","كبير","جديد","يوم","عمل","حياة","بيت","مدينة","رجل","أهل","زمن","مكان","دولة","شعب","أرض","كتاب","باب","ماء","نور","قلب","عين","يد","رأس","وجه","صوت","كلام","حال","أمر","وقت","فكر","حق","علم","اسم","طريق","خير","شيء","ليل","نهار","سنة","شهر","أسبوع","ساعة","دقيقة","فكرة","سؤال","جواب","سبب","نتيجة","بداية","نهاية","لغة","كلمة","جملة","معنى"];

export const WORD_POOLS = {
  en:           WORDS_EN,
  "en-british": [...WORDS_EN, ...WORDS_BRIT],
  python:       WORDS_PY,
  cpp:          WORDS_CPP,
  go:           WORDS_GO,
  rust:         WORDS_RUST,
  es:           WORDS_ES,
  ar:           WORDS_AR,
};

const QUOTES = [
  { text:"The only way to do great work is to love what you do.", author:"Steve Jobs" },
  { text:"In the middle of every difficulty lies opportunity.", author:"Albert Einstein" },
  { text:"It does not matter how slowly you go as long as you do not stop.", author:"Confucius" },
  { text:"Life is what happens when you are busy making other plans.", author:"John Lennon" },
  { text:"The future belongs to those who believe in the beauty of their dreams.", author:"Eleanor Roosevelt" },
];
export const getRandomQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];

// ─────────────────────────────────────────────────────────────
// AUTH STORE
// ─────────────────────────────────────────────────────────────
const LS_USER    = 'leo_user';
const LS_ACCESS  = 'leo_access';
const LS_REFRESH = 'leo_refresh';
const LS_EXPIRY  = 'leo_expiry';
const LS_GUEST   = 'leo_guest_id';
// Build-time env var (see Dockerfile's VITE_API_URL build ARG /
// docker-compose.yml) — falls back to the same default that always worked
// for the single-host docker-compose deployment, so local dev and existing
// deploys are unaffected unless VITE_API_URL is explicitly set.
const SERVER     = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function makeFriendlyGuestId() {
  const ADJ  = ["swift","bold","calm","keen","cool","sharp","quick","agile","nimble","laser","rapid","sleek","bright","quiet","fleet","crisp","clean","silent","sonic","steady"];
  const NOUN = ["tiger","eagle","falcon","panda","wolf","hawk","lynx","raven","cobra","fox","orca","manta","gecko","viper","bear","crane","kite","finch","bison","moth"];
  const cap  = w => w[0].toUpperCase() + w.slice(1);
  return `${cap(ADJ[Math.floor(Math.random()*ADJ.length)])}${cap(NOUN[Math.floor(Math.random()*NOUN.length)])}_${String(Math.floor(Math.random()*90)+10)}`;
}

function loadInitialUser() {
  try {
    const u = localStorage.getItem(LS_USER);
    if (u) return { user: JSON.parse(u), isGuest: false };
  } catch {}
  let gid = localStorage.getItem(LS_GUEST);
  if (!gid) { gid = makeFriendlyGuestId(); localStorage.setItem(LS_GUEST, gid); }
  return { user: { userId:gid, username:gid, role:'guest', mmr:1000, wallet:0 }, isGuest:true };
}

const initial = loadInitialUser();

export const useAuthStore = create((set, get) => ({
  user:    initial.user,
  isGuest: initial.isGuest,
  token:   localStorage.getItem(LS_ACCESS) || null,
  loading: false,
  error:   null,

  setAuth(user, accessToken, refreshToken) {
    localStorage.setItem(LS_USER,    JSON.stringify(user));
    localStorage.setItem(LS_ACCESS,  accessToken);
    localStorage.setItem(LS_REFRESH, refreshToken);
    localStorage.setItem(LS_EXPIRY,  String(Date.now() + 14*60*1000));
    set({ user, isGuest: false, token: accessToken, error: null });
  },

  async register({ username, email, password, role }) {
    set({ loading: true, error: null });
    try {
      const r = await fetch(`${SERVER}/api/auth/register`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username, email, password, role }),
      });
      const d = await r.json();
      if (!r.ok) { set({ loading:false, error: d.error }); return false; }
      get().setAuth(d.user, d.accessToken, d.refreshToken);
      set({ loading: false });
      return true;
    } catch { set({ loading:false, error:'NETWORK_ERROR' }); return false; }
  },

  async login({ identifier, password }) {
    set({ loading: true, error: null });
    try {
      const r = await fetch(`${SERVER}/api/auth/login`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ identifier, password }),
      });
      const d = await r.json();
      if (!r.ok) { set({ loading:false, error: d.error }); return false; }
      get().setAuth(d.user, d.accessToken, d.refreshToken);
      set({ loading: false });
      return true;
    } catch { set({ loading:false, error:'NETWORK_ERROR' }); return false; }
  },

  async silentRefresh() {
    const expiry = Number(localStorage.getItem(LS_EXPIRY) || 0);
    if (expiry - Date.now() > 60_000) return get().token;
    const rt = localStorage.getItem(LS_REFRESH);
    if (!rt) return null;
    try {
      const r = await fetch(`${SERVER}/api/auth/refresh`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!r.ok) { get().logout(); return null; }
      const d = await r.json();
      localStorage.setItem(LS_ACCESS,  d.accessToken);
      localStorage.setItem(LS_REFRESH, d.refreshToken);
      localStorage.setItem(LS_EXPIRY,  String(Date.now() + 14*60*1000));
      set({ token: d.accessToken });
      return d.accessToken;
    } catch { return null; }
  },

  logout() {
    const rt = localStorage.getItem(LS_REFRESH);
    if (rt) fetch(`${SERVER}/api/auth/logout`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({refreshToken:rt}) }).catch(()=>{});
    [LS_USER,LS_ACCESS,LS_REFRESH,LS_EXPIRY].forEach(k=>localStorage.removeItem(k));
    let gid = localStorage.getItem(LS_GUEST);
    if (!gid) { gid = makeFriendlyGuestId(); localStorage.setItem(LS_GUEST, gid); }
    const guestUser = { userId:gid, username:gid, role:'guest', mmr:1000, wallet:0 };
    set({ user:guestUser, isGuest:true, token:null, error:null });
    useStatsStore.getState().reset();
    useTeacherStore.getState().reset();
  },
}));

// ─────────────────────────────────────────────────────────────
// SETTINGS STORE
// ─────────────────────────────────────────────────────────────
const LS_SETTINGS = 'leo_settings_v3';

const DEFAULTS = {
  mode:         'time',
  timeLimit:    30,
  wordCount:    25,
  difficulty:   'normal',    // normal | expert | master
  language:     'en',
  funbox:       'none',      // none | mirror | earthquake | choo_choo | gibberish | no_backspace | polyglot
  punctuation:  false,
  numbers:      false,
  britishEn:    false,
  quickRestart: 'tab',       // tab | esc | enter
  blindMode:    false,
  repeatQuote:  false,
  minSpeed:     0,
  minAccuracy:  0,
  theme:        'dark',
  font:         'Space Mono',
  caretStyle:   'line',      // line | block | underline | off
  showKeymap:   false,
  soundType:    'off',
  soundVolume:  0,
  pianoSubMode: 'composition', // composition | canvas
  pianoOctave:  4,           // base octave shift for keyboard→MIDI mapping
  pianoInstrument: 'grand-piano', // grand-piano | electric-piano | organ | synth-pad
};

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export const useSettingsStore = create((set, get) => ({
  ...loadSettings(),

  set(key, value) {
    set({ [key]: value });
    const next = { ...get(), [key]: value };
    localStorage.setItem(LS_SETTINGS, JSON.stringify(next));
    // Apply theme to <html>
    if (key === 'theme') document.documentElement.setAttribute('data-theme', value);
    if (key === 'font')  document.documentElement.style.setProperty('--font-mono', `'${value}', monospace`);
    // Sync to server (fire-and-forget)
    const token = useAuthStore.getState().token;
    if (token) {
      fetch(`${SERVER}/api/profile/settings`, {
        method:'PUT', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body: JSON.stringify({ [key]: value }),
      }).catch(()=>{});
    }
  },

  reset() {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(DEFAULTS));
    document.documentElement.setAttribute('data-theme', DEFAULTS.theme);
    set({ ...DEFAULTS });
  },

  applyAll() {
    const s = get();
    document.documentElement.setAttribute('data-theme', s.theme);
    document.documentElement.style.setProperty('--font-mono', `'${s.font}', monospace`);
  },
}));

// ─────────────────────────────────────────────────────────────
// STATS STORE (typing-hub run history — server-persisted, signed-in only)
// ─────────────────────────────────────────────────────────────
export const useStatsStore = create((set, get) => ({
  summary:   null,   // { totalRuns, bestWpm, avgWpm, avgAccuracy, trend }
  runs:      [],
  runsTotal: 0,
  loading:   false,

  async saveRun(run) {
    const token = useAuthStore.getState().token;
    if (!token) return; // guests: nothing to persist
    try {
      await fetch(`${SERVER}/api/stats/runs`, {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body: JSON.stringify(run),
      });
    } catch {}
  },

  async fetchSummary() {
    const token = useAuthStore.getState().token;
    if (!token) { set({ summary: null }); return; }
    set({ loading: true });
    try {
      const r = await fetch(`${SERVER}/api/stats/summary`, { headers:{'Authorization':`Bearer ${token}`} });
      if (r.ok) set({ summary: await r.json() });
    } catch {} finally { set({ loading: false }); }
  },

  async fetchRuns(limit = 20, offset = 0) {
    const token = useAuthStore.getState().token;
    if (!token) { set({ runs: [], runsTotal: 0 }); return; }
    try {
      const r = await fetch(`${SERVER}/api/stats/runs?limit=${limit}&offset=${offset}`, { headers:{'Authorization':`Bearer ${token}`} });
      if (r.ok) { const d = await r.json(); set({ runs: d.runs, runsTotal: d.total }); }
    } catch {}
  },

  reset: () => set({ summary: null, runs: [], runsTotal: 0, loading: false }),
}));

// ─────────────────────────────────────────────────────────────
// TEACHER STORE (educator roster — join code + per-student aggregate stats)
// ─────────────────────────────────────────────────────────────
export const useTeacherStore = create((set) => ({
  joinCode: null,
  students: [],
  loading:  false,
  error:    null,

  async fetchRoster() {
    const token = useAuthStore.getState().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const r = await fetch(`${SERVER}/api/teacher/roster`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        set({ joinCode: d.joinCode, students: d.students, loading: false });
      } else {
        set({ loading: false, error: (await r.json().catch(() => ({}))).error || 'REQUEST_FAILED' });
      }
    } catch { set({ loading: false, error: 'NETWORK_ERROR' }); }
  },

  /** Returns { ok, error? } — used by the Settings-page "Join a Class" form. */
  async joinClass(joinCode) {
    const token = useAuthStore.getState().token;
    if (!token) return { ok: false, error: 'NOT_SIGNED_IN' };
    try {
      const r = await fetch(`${SERVER}/api/teacher/roster/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ joinCode }),
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: d.error || 'REQUEST_FAILED' };
      return { ok: true, teacherUsername: d.teacherUsername };
    } catch { return { ok: false, error: 'NETWORK_ERROR' }; }
  },

  /** Returns { ok, accounts?, error? } — the Accounts tab's real "Create Accounts" action. */
  async createBulkAccounts(count, prefix) {
    const token = useAuthStore.getState().token;
    if (!token) return { ok: false, error: 'NOT_SIGNED_IN' };
    try {
      const r = await fetch(`${SERVER}/api/teacher/accounts/bulk`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ count, prefix }),
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: d.error || 'REQUEST_FAILED' };
      return { ok: true, accounts: d.accounts };
    } catch { return { ok: false, error: 'NETWORK_ERROR' }; }
  },

  reset: () => set({ joinCode: null, students: [], loading: false, error: null }),
}));

// ─────────────────────────────────────────────────────────────
// VIEW STORE
// ─────────────────────────────────────────────────────────────
export const useViewStore = create((set) => ({
  page: 'type',   // type | race | piano | midirace | settings | login | register | educator | stats
  setPage: (page) => set({ page }),
}));

// ─────────────────────────────────────────────────────────────
// RACE STORE (WebSocket state — opponent progress, phase, etc.)
// ─────────────────────────────────────────────────────────────
export const useRaceStore = create((set, get) => ({
  phase:      'idle',     // idle|queued|matched|voting|countdown|racing|results
  lobbyId:    null,
  players:    [],         // { userId, username, mmr }[]
  opponents:  [],         // { userId, username, progress, wpm }[]
  voteOptions:[],
  payloadText:null,
  payloadReady:false,
  startEpoch: null,
  myId:       null,
  results:    null,
  anticheatWarnings: 0,

  setPhase: (phase) => set({ phase }),
  setLobby: (lobbyId, players, myId) => {
    const opponents = players
      .filter(p => p.userId !== myId)
      .map(p => ({ ...p, progress:0, wpm:0 }));
    set({ lobbyId, players, opponents, myId, phase:'matched' });
  },
  setVoteOptions: (options, endsAt) => set({ voteOptions:options, voteEndsAt:endsAt, phase:'voting' }),
  setCountdown: (startsAt) => set({ startEpoch:startsAt, payloadReady:false, phase:'countdown' }),
  setPayload: (text) => set({ payloadText:text, payloadReady:true }),
  setRacing: () => set({ phase:'racing' }),
  updateOpponent: (userId, username, progress, wpm) => set(state => ({
    opponents: state.opponents.map(o =>
      o.userId === userId ? { ...o, progress, wpm } : o
    ),
  })),
  setResults: (results) => set({ results, phase:'results' }),
  addWarning: () => set(s => ({ anticheatWarnings: s.anticheatWarnings + 1 })),
  reset: () => set({
    phase:'idle', lobbyId:null, players:[], opponents:[], voteOptions:[],
    payloadText:null, payloadReady:false, startEpoch:null, results:null, anticheatWarnings:0,
  }),
}));

// ─────────────────────────────────────────────────────────────
// MIDI RACE STORE (WebSocket state — proficiency-based piano race)
// ─────────────────────────────────────────────────────────────
export const useMidiRaceStore = create((set) => ({
  phase:      'idle', // idle|queued|matched|countdown|playing|results
  lobbyId:    null,
  players:    [],      // { userId, username, isGuest }[]
  pieceId:    null,
  pieceTitle: null,
  startEpoch: null,
  myId:       null,
  results:    null,
  anticheatWarnings: 0,

  setPhase: (phase) => set({ phase }),
  setQueued: () => set({ phase: 'queued' }),
  setMatched: (lobbyId, players, pieceId, pieceTitle, myId) => set({
    lobbyId, players, pieceId, pieceTitle, myId, phase: 'matched',
  }),
  setCountdown: (startsAt) => set({ startEpoch: startsAt, phase: 'countdown' }),
  setPlaying: () => set({ phase: 'playing' }),
  setResults: (results) => set({ results, phase: 'results' }),
  addWarning: () => set(s => ({ anticheatWarnings: s.anticheatWarnings + 1 })),
  reset: () => set({
    phase: 'idle', lobbyId: null, players: [], pieceId: null, pieceTitle: null,
    startEpoch: null, results: null, anticheatWarnings: 0,
  }),
}));

// ─────────────────────────────────────────────────────────────
// SESSION LOCK STORE (WebSocket state — an educator's live Focus-tab
// broadcast, applied to a student's client. In-memory only — not
// persisted, doesn't survive a page refresh, matches the server's
// same "don't re-sync on reconnect" scope cut. See server/session/socket.js.)
// ─────────────────────────────────────────────────────────────
export const useSessionLockStore = create((set) => ({
  lockedModes:   [], // subset of ['time','words','quote','zen','funbox','piano','race']
  screenLocked:  false,
  maskUsernames: false,
  chatDisabled:  false,
  applyLock: (payload) => set({
    lockedModes:   Array.isArray(payload?.lockedModes) ? payload.lockedModes : [],
    screenLocked:  !!payload?.screenLocked,
    maskUsernames: !!payload?.maskUsernames,
    chatDisabled:  !!payload?.chatDisabled,
  }),
}));

// ─────────────────────────────────────────────────────────────
// MIDI STORE  (keyboard/device status — drives nav indicator + piano UI)
// ─────────────────────────────────────────────────────────────
export const useMidiStore = create((set) => ({
  status:      'idle',   // idle | loading | connected | fallback | error
  deviceName:  null,
  loopStep:    -1,       // -1=none, chase animation step
  pressedKeys: new Set(),// Set<midiNote> of currently held notes
  keyCount:    61,       // detected key count from device (49|61|76|88)

  setStatus:   (status, deviceName = null) => set({ status, deviceName }),
  setLoopStep: (step) => set({ loopStep: step }),
  setKeyCount: (n)    => set({ keyCount: n }),
  pressKey:    (midiNote) => set(s => {
    const next = new Set(s.pressedKeys);
    next.add(midiNote);
    return { pressedKeys: next };
  }),
  releaseKey:  (midiNote) => set(s => {
    const next = new Set(s.pressedKeys);
    next.delete(midiNote);
    return { pressedKeys: next };
  }),
  reset: () => set({ status:'idle', deviceName:null, loopStep:-1, pressedKeys: new Set() }),
}));
