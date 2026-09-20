/**
 * VirtualKeymap — on-screen QWERTY keyboard for Typing Hub, behind the
 * `showKeymap` setting (Settings > Virtual keymap; also `:set showKeymap`).
 * Highlights the single physical key that needs to be pressed next, mirroring
 * PianoKeymap.jsx's highlight-one-key-at-a-time convention on the piano page.
 */
import { useSettingsStore } from '../../store/index.js';
import './VirtualKeymap.css';

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

/** @param {{ nextChar: string }} props - the next character the engine expects (see useTypingEngine's words[wordIdx][charIdx]); ' ' means "press space to commit the word." */
export function VirtualKeymap({ nextChar }) {
  const showKeymap = useSettingsStore(s => s.showKeymap);
  if (!showKeymap) return null;

  const isSpace = !nextChar || nextChar === ' ';
  const target  = isSpace ? null : nextChar.toLowerCase();

  return (
    <div className="virtual-keymap" aria-hidden="true">
      {ROWS.map((row, i) => (
        <div className="vk-row" key={i}>
          {row.map(k => (
            <div key={k} className={`vk-key ${k === target ? 'vk-active' : ''}`}>{k}</div>
          ))}
        </div>
      ))}
      <div className="vk-row">
        <div className={`vk-key vk-space ${isSpace ? 'vk-active' : ''}`}>space</div>
      </div>
    </div>
  );
}
