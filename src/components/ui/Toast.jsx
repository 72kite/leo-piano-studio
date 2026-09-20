import { useState, useEffect, useCallback } from 'react';
import './Toast.css';

let _addToast = null;
export const toast = (msg, type='info', ms=3500) => _addToast?.({ msg, type, ms });

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _addToast = ({ msg, type, ms }) => {
      const id = Date.now() + Math.random();
      setToasts(t => [...t, { id, msg, type, visible:false }]);
      setTimeout(() => setToasts(t => t.map(x => x.id===id ? {...x,visible:true} : x)), 10);
      setTimeout(() => setToasts(t => t.map(x => x.id===id ? {...x,visible:false} : x)), ms);
      setTimeout(() => setToasts(t => t.filter(x => x.id!==id)), ms+400);
    };
    return () => { _addToast = null; };
  }, []);

  return (
    <div className="toast-container" aria-live="assertive">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type} ${t.visible ? 'show':''}`} role="status">
          {t.msg}
        </div>
      ))}
    </div>
  );
}
