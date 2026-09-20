/**
 * MidiIndicator — persistent MIDI status pill in the nav bar.
 * Runs a silent background probe on first render.
 * Shows: MIDI ✓ | Keyboard mode | No device
 */
import { useEffect } from 'react';
import { useMidiStore } from '../../store/index.js';
import './MidiIndicator.css';

export function MidiIndicator() {
  const { status, deviceName } = useMidiStore();

  // Silent background probe (no UI disruption)
  useEffect(() => {
    if (status !== 'idle') return;
    if (!navigator.requestMIDIAccess) {
      useMidiStore.getState().setStatus('fallback', null);
      return;
    }
    navigator.requestMIDIAccess({ sysex: false })
      .then(access => {
        const inputs = [...access.inputs.values()].filter(i => i.state === 'connected');
        if (inputs.length > 0) {
          useMidiStore.getState().setStatus('connected', inputs[0].name);
        } else {
          useMidiStore.getState().setStatus('fallback', null);
        }
        // Update on plug-in
        access.onstatechange = (ev) => {
          if (ev.port.type === 'input') {
            const ins = [...access.inputs.values()].filter(i => i.state === 'connected');
            useMidiStore.getState().setStatus(
              ins.length > 0 ? 'connected' : 'fallback',
              ins[0]?.name || null
            );
          }
        };
      })
      .catch(() => useMidiStore.getState().setStatus('fallback', null));
  }, []);

  if (status === 'idle' || status === 'loading') return null;

  const configs = {
    connected : { label: deviceName ? `MIDI: ${deviceName.slice(0,16)}` : 'MIDI ✓', cls: 'ind-ok' },
    fallback  : { label: 'Keyboard mode', cls: 'ind-warn' },
    error     : { label: 'No device',     cls: 'ind-err' },
  };

  const cfg = configs[status] || configs.fallback;

  return (
    <div className={`midi-indicator ${cfg.cls}`} title={deviceName || 'No MIDI device'}>
      <span className="midi-ind-dot" aria-hidden="true" />
      <span className="midi-ind-label">{cfg.label}</span>
    </div>
  );
}
