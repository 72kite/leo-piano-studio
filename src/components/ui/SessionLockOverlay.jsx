/**
 * SessionLockOverlay — full-screen block shown when an educator's Focus-tab
 * broadcast sets screenLocked: true. Sits above everything, no dismiss
 * control — it clears itself the moment the teacher broadcasts again with
 * screenLocked: false (useSessionLockStore.applyLock always replaces the
 * whole lock state, so an "unlock" broadcast is just re-broadcasting with
 * the toggle off).
 */
import { useSessionLockStore } from '../../store/index.js';
import { Lock } from 'lucide-react';
import './SessionLockOverlay.css';

export function SessionLockOverlay() {
  const screenLocked = useSessionLockStore(s => s.screenLocked);
  if (!screenLocked) return null;

  return (
    <div className="session-lock-overlay" role="alertdialog" aria-modal="true" aria-label="Screen locked by your teacher">
      <Lock size={28} />
      <div className="slo-title">Your screen is locked</div>
      <div className="slo-sub">Your teacher has locked this session. It'll unlock automatically.</div>
    </div>
  );
}
