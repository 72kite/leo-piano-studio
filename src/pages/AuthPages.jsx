import { useState } from 'react';
import { useAuthStore, useViewStore } from '../store/index.js';
import { toast } from '../components/ui/Toast.jsx';
import './AuthPages.css';

export function LoginPage() {
  const { login, loading, error } = useAuthStore();
  const setPage = useViewStore(s => s.setPage);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!id || !pw) { toast('Fill in all fields','warn'); return; }
    const ok = await login({ identifier:id, password:pw });
    if (ok) { toast('Welcome back!','success'); setPage('type'); }
    else toast(error==='INVALID_CREDENTIALS'?'Wrong username or password':error==='RATE_LIMIT'?'Too many attempts':'Login failed','error');
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-logo">PROJECT LEO</div>
        <div className="auth-tagline">type faster. compete harder.</div>
        <h1 className="auth-title">Sign in</h1>
        <label className="field">
          <span className="field-lbl">Username or email</span>
          <input type="text" autoComplete="username" placeholder="keyzero" value={id} onChange={e=>setId(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-lbl">Password</span>
          <input type="password" autoComplete="current-password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? <span className="spinner dark" /> : 'Sign in'}
        </button>

        <div className="auth-or"><span>or</span></div>

        <div className="social-btns">
          <button
            type="button"
            className="social-btn"
            disabled
            title="Coming in a future update"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Sign in with Google
          </button>
          <button
            type="button"
            className="social-btn"
            disabled
            title="Coming in a future update"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.74 3.17.8 1.2-.24 2.35-.93 3.62-.84 1.54.13 2.7.73 3.44 1.88-3.16 1.9-2.4 6.02.77 7.14-.55 1.4-1.27 2.8-3 3.9zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            Sign in with Apple
          </button>
        </div>

        <div className="auth-divider" />
        <div className="auth-toggle">No account? <span onClick={()=>setPage('register')}>Create one</span></div>
        <div className="auth-guest" onClick={()=>setPage('type')}>Continue as guest →</div>
      </form>
    </div>
  );
}

export function RegisterPage() {
  const { register, loading } = useAuthStore();
  const setPage = useViewStore(s => s.setPage);
  const [role, setRole]     = useState('student');
  const [uname, setUname]   = useState('');
  const [email, setEmail]   = useState('');
  const [pw, setPw]         = useState('');
  const [pw2, setPw2]       = useState('');
  const [errs, setErrs]     = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const newErrs = {};
    if (uname.length < 3) newErrs.uname = 'Min 3 characters';
    if (uname.toLowerCase().startsWith('guest_')) newErrs.uname = 'Cannot start with Guest_';
    if (pw.length < 6) newErrs.pw = 'Min 6 characters';
    if (pw !== pw2)    newErrs.pw2 = 'Passwords do not match';
    setErrs(newErrs);
    if (Object.keys(newErrs).length) return;
    const ok = await register({ username:uname, email:email||undefined, password:pw, role });
    if (ok) { toast(`Welcome, ${uname}!`,'success'); setPage('type'); }
    else { toast('Registration failed','error'); }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-logo">PROJECT LEO</div>
        <div className="auth-tagline">Create your account</div>
        <h1 className="auth-title">Choose your role</h1>

        <div className="role-picker">
          {[{id:'student',icon:'🎓',name:'Student',desc:'Practice, race, track progress'},
            {id:'educator',icon:'🏫',name:'Educator',desc:'Manage classrooms, monitor metrics'}].map(r=>(
            <div
              key={r.id}
              className={`role-card ${r.id} ${role===r.id?'selected':''}`}
              onClick={()=>setRole(r.id)}
              role="radio"
              aria-checked={role===r.id}
              tabIndex={0}
              onKeyDown={e=>e.key==='Enter'&&setRole(r.id)}
            >
              <div className="role-icon">{r.icon}</div>
              <div className="role-name">{r.name}</div>
              <div className="role-desc">{r.desc}</div>
            </div>
          ))}
        </div>

        {[
          {lbl:'Username',id:'uname',type:'text',val:uname,set:setUname,ph:'keyzero',ac:'username'},
          {lbl:'Email (optional)',id:'email',type:'email',val:email,set:setEmail,ph:'you@school.edu',ac:'email'},
          {lbl:'Password',id:'pw',type:'password',val:pw,set:setPw,ph:'min 6 chars',ac:'new-password'},
          {lbl:'Confirm password',id:'pw2',type:'password',val:pw2,set:setPw2,ph:'••••••••',ac:'new-password'},
        ].map(f=>(
          <label key={f.id} className="field">
            <span className="field-lbl">{f.lbl}</span>
            <input type={f.type} autoComplete={f.ac} placeholder={f.ph} value={f.val} onChange={e=>f.set(e.target.value)} className={errs[f.id]?'invalid':''} />
            {errs[f.id] && <span className="field-err">{errs[f.id]}</span>}
          </label>
        ))}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? <span className="spinner dark" /> : 'Create account'}
        </button>
        <div className="auth-divider" />
        <div className="auth-toggle">Have an account? <span onClick={()=>setPage('login')}>Sign in</span></div>
      </form>
    </div>
  );
}
