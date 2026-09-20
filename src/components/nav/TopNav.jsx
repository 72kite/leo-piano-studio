import { useAuthStore, useViewStore, useSettingsStore, useSessionLockStore } from '../../store/index.js';
import { toast } from '../ui/Toast.jsx';
import { useState, useEffect } from 'react';
import { MidiIndicator } from './MidiIndicator.jsx';
import { Keyboard, Piano, Flag, Settings, ChevronDown, LogOut, GraduationCap, BarChart2 } from 'lucide-react';
import './TopNav.css';

export function TopNav() {
  const { user, isGuest, logout } = useAuthStore();
  const { page, setPage }         = useViewStore();
  const [dropOpen, setDropOpen]   = useState(false);
  const lockedModes                = useSessionLockStore(s => s.lockedModes);

  const initials = (user?.username || '?').slice(0,2).toUpperCase();
  // 'midirace' isn't its own lockable chip in the Focus tab — it's only ever
  // reached from the Piano page's "Join MIDI Race" button, so locking piano
  // also locks it (otherwise a student mid-MIDI-race could dodge a lock by
  // just not being on 'piano' at the exact moment it lands).
  const pageLocked = (id) => {
    if (id === 'midirace') return lockedModes.includes('piano');
    return (id === 'piano' || id === 'race') && lockedModes.includes(id);
  };

  const nav = (dest) => {
    if (pageLocked(dest)) return;
    setDropOpen(false);
    setPage(dest);
  };

  // If the teacher locks the page a student is currently on, boot them to
  // Type immediately rather than leaving them stranded on a locked page.
  useEffect(() => {
    if (pageLocked(page)) setPage('type');
  }, [lockedModes, page]);

  return (
    <nav className="topnav" role="navigation" aria-label="Main navigation">
      <span className="nav-logo">PROJECT LEO</span>
      <div className="nav-sep" aria-hidden="true" />
      <ul className="nav-links" role="list">
        {[
          { id:'type',     icon:<Keyboard size={14}/>,  label:'Type'     },
          { id:'race',     icon:<Flag size={14}/>,       label:'Race'     },
          { id:'piano',    icon:<Piano size={14}/>,      label:'Piano'    },
          { id:'settings', icon:<Settings size={14}/>,   label:'Settings' },
        ].map(({ id, icon, label }) => (
          <li key={id}>
            <a
              href="#"
              className={`nav-link-item ${page===id ? 'nav-active' : ''} ${id==='settings' ? 'settings-link' : ''} ${pageLocked(id) ? 'nav-locked' : ''}`}
              onClick={e=>{e.preventDefault();nav(id);}}
              aria-label={label}
              aria-disabled={pageLocked(id)}
              title={pageLocked(id) ? 'Locked by your teacher' : undefined}
            >
              <span className={`nav-icon ${id==='settings' ? 'settings-icon' : ''}`}>{icon}</span>
              <span className="nav-label">{label}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="nav-right">
        <MidiIndicator />
        {isGuest ? (
          <button className="guest-pill" onClick={()=>nav('login')}>
            {user?.username} · Sign in
          </button>
        ) : (
          <div className="profile-wrap">
            <button
              className={`profile-btn ${dropOpen?'open':''}`}
              onClick={()=>setDropOpen(o=>!o)}
              aria-haspopup="true"
              aria-expanded={dropOpen}
            >
              <div className="pp-av">{initials}</div>
              <span className="pp-name">{user.username}</span>
              <ChevronDown size={14} className="pp-chevron" />
            </button>

            {dropOpen && (
              <div className="profile-drop" role="menu">
                <div className="drop-head">
                  <div className="drop-av-lg">{initials}</div>
                  <div>
                    <div className="drop-name">{user.username}</div>
                    {user.role === 'educator' && <span className="drop-badge educator">Teacher</span>}
                  </div>
                </div>
                <div className="drop-stats">
                  <div className="drop-stat"><div className="dsv">{user.mmr||1000}</div><div className="dsl">MMR</div></div>
                  <div className="drop-stat"><div className="dsv">{user.wallet||0}</div><div className="dsl">Coins</div></div>
                </div>
                <div className="drop-items">
                  {[...['stats','race','piano','settings'], ...(user?.role==='educator'?['educator']:[])].map(p=>(
                    <button key={p} className={`drop-item ${pageLocked(p) ? 'nav-locked' : ''}`} onClick={()=>nav(p)} disabled={pageLocked(p)} title={pageLocked(p) ? 'Locked by your teacher' : undefined}>
                      {p==='stats'?<><BarChart2 size={13}/> Stats</>:p==='race'?<><Flag size={13}/> Competitive Race</>:p==='piano'?<><Piano size={13}/> Piano Mode</>:p==='educator'?<><GraduationCap size={13}/> Teacher Portal</>:<><Settings size={13}/> Settings</>}
                    </button>
                  ))}
                </div>
                <div className="drop-divider" />
                <div className="drop-items">
                  <button className="drop-item danger" onClick={()=>{logout();setDropOpen(false);toast('Signed out','info');}}>
                    <LogOut size={13}/> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
