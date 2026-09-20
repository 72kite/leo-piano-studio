import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMidi } from './useMidi.js';
import { useMidiStore, useSettingsStore } from '../store/index.js';

function fakeInput(id, name) {
  return { id, name, type: 'input', state: 'connected', onmidimessage: null };
}

/** Lets a pending `await navigator.requestMIDIAccess(...)` (and the
 *  synchronous work right after it) resolve, without depending on real time. */
async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  useMidiStore.getState().reset();
  useSettingsStore.getState().reset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete navigator.requestMIDIAccess;
});

describe('useMidi — keyboard fallback (no Web MIDI support)', () => {
  it('activates immediately when the browser has no requestMIDIAccess', () => {
    delete navigator.requestMIDIAccess;
    renderHook(() => useMidi({ onNoteOn: vi.fn(), onNoteOff: vi.fn() }));
    expect(useMidiStore.getState().status).toBe('fallback');
  });

  it('registers a keydown/keyup for every mapped key, including "i"', () => {
    delete navigator.requestMIDIAccess;
    const onNoteOn = vi.fn();
    const onNoteOff = vi.fn();
    renderHook(() => useMidi({ onNoteOn, onNoteOff }));

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' })); });

    // 'i' → offset 24 above the base note (60 at the default octave 4) → 84
    expect(onNoteOn).toHaveBeenCalledWith(84, 80);
    expect(useMidiStore.getState().pressedKeys.has(84)).toBe(true);

    act(() => { document.dispatchEvent(new KeyboardEvent('keyup', { key: 'i' })); });
    expect(onNoteOff).toHaveBeenCalledWith(84);
    expect(useMidiStore.getState().pressedKeys.has(84)).toBe(false);
  });

  it('ignores unmapped keys and repeated keydown events', () => {
    delete navigator.requestMIDIAccess;
    const onNoteOn = vi.fn();
    renderHook(() => useMidi({ onNoteOn, onNoteOff: vi.fn() }));

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' })); }); // unmapped
    expect(onNoteOn).not.toHaveBeenCalled();

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' })); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', repeat: true })); });
    expect(onNoteOn).toHaveBeenCalledTimes(1); // repeat suppressed
  });
});

describe('useMidi — Web MIDI hardware', () => {
  it('binds every connected input, not just the first one enumerated', async () => {
    // Regression test: the piano is deliberately NOT the first entry in the
    // inputs map, which is exactly the scenario where the old
    // inputs[0]-only binding silently dropped every key press.
    const portA = fakeInput('a', 'USB MIDI Thru');
    const portB = fakeInput('b', 'Yamaha P-45');
    const access = { inputs: new Map([['a', portA], ['b', portB]]), onstatechange: null };
    navigator.requestMIDIAccess = vi.fn().mockResolvedValue(access);

    const onNoteOn = vi.fn();
    renderHook(() => useMidi({ onNoteOn, onNoteOff: vi.fn() }));
    await flushAsync();

    expect(useMidiStore.getState().status).toBe('connected');
    expect(portA.onmidimessage).toBeTypeOf('function');
    expect(portB.onmidimessage).toBeTypeOf('function');

    act(() => { portB.onmidimessage({ data: [0x90, 67, 100] }); }); // note-on, middle-ish key
    expect(onNoteOn).toHaveBeenCalledWith(67, 100);
    expect(useMidiStore.getState().pressedKeys.has(67)).toBe(true);

    act(() => { portB.onmidimessage({ data: [0x80, 67, 0] }); }); // note-off
    expect(useMidiStore.getState().pressedKeys.has(67)).toBe(false);
  });

  it('picks up a device that connects after the initial probe finds none', async () => {
    const access = { inputs: new Map(), onstatechange: null };
    navigator.requestMIDIAccess = vi.fn().mockResolvedValue(access);

    const onNoteOn = vi.fn();
    renderHook(() => useMidi({ onNoteOn, onNoteOff: vi.fn() }));
    await flushAsync();
    expect(useMidiStore.getState().status).toBe('loading');

    const lateInput = fakeInput('late', 'Late-Connecting Piano');
    access.inputs.set('late', lateInput);
    act(() => { access.onstatechange({ port: lateInput }); });

    expect(useMidiStore.getState().status).toBe('connected');
    expect(lateInput.onmidimessage).toBeTypeOf('function');

    act(() => { lateInput.onmidimessage({ data: [0x90, 71, 90] }); });
    expect(onNoteOn).toHaveBeenCalledWith(71, 90);

    // Should not have fallen back to keyboard mode once connected.
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(useMidiStore.getState().status).toBe('connected');
  });

  it('falls back to keyboard once the only connected device disconnects', async () => {
    const port = fakeInput('a', 'Solo Keyboard');
    const access = { inputs: new Map([['a', port]]), onstatechange: null };
    navigator.requestMIDIAccess = vi.fn().mockResolvedValue(access);

    renderHook(() => useMidi({ onNoteOn: vi.fn(), onNoteOff: vi.fn() }));
    await flushAsync();
    expect(useMidiStore.getState().status).toBe('connected');

    act(() => { access.onstatechange({ port: { ...port, state: 'disconnected' } }); });
    expect(useMidiStore.getState().status).toBe('loading');

    act(() => { vi.advanceTimersByTime(4001); });
    expect(useMidiStore.getState().status).toBe('fallback');
  });

  it('falls back to keyboard if permission is denied', async () => {
    navigator.requestMIDIAccess = vi.fn().mockRejectedValue(new Error('denied'));
    renderHook(() => useMidi({ onNoteOn: vi.fn(), onNoteOff: vi.fn() }));
    await flushAsync();
    expect(useMidiStore.getState().status).toBe('fallback');
  });
});
