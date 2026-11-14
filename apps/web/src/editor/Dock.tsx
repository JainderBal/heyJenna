/** The floating tool dock at the bottom of the canvas (tools are visual for now, like the prototype). */
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from '../app/useEditorStore';

type Tool = 'move' | 'frame' | 'rect' | 'pen' | 'text' | 'photo' | 'comment';
const sw = { stroke: 'currentColor', strokeWidth: 1.3, fill: 'none' } as const;

const TOOLS: (readonly [Tool, string, ReactNode] | '|')[] = [
  ['move', 'Move  V', <path d="M3 2l9 4.5-4 1.2-1.6 4.3z" fill="currentColor" />],
  ['frame', 'Frame  F', <path d="M5 1v14M11 1v14M1 5h14M1 11h14" {...sw} />],
  ['rect', 'Rectangle  R', <rect x="2.5" y="3.5" width="11" height="9" rx="1" {...sw} />],
  ['pen', 'Pen  P', <path d="M3 13l1-4 6-6 3 3-6 6zM9 4l3 3" {...sw} />],
  ['text', 'Text  T', <path d="M3 3h10M8 3v10" {...sw} strokeWidth={1.5} />],
  '|',
  [
    'photo',
    'Add photo',
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" {...sw} />
      <circle cx="6" cy="7" r="1.3" fill="currentColor" />
      <path d="M2.5 12l4-4 3 3 2-2 2.5 3" {...sw} />
    </>,
  ],
  ['comment', 'Comment  C', <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" {...sw} />],
];
const KEYS: Record<string, Tool> = { v: 'move', f: 'frame', r: 'rect', p: 'pen', t: 'text', c: 'comment' };

export function Dock() {
  const [tool, setTool] = useState<Tool>('move');
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input,textarea,[contenteditable]') || e.metaKey || e.ctrlKey) return;
      const t = KEYS[e.key.toLowerCase()];
      if (t) setTool(t);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="dock" role="toolbar" aria-label="Tools" data-overlay>
      {TOOLS.map((t, i) =>
        t === '|' ? (
          <span key={i} className="div" />
        ) : (
          <button
            key={t[0]}
            className={`tool${t[0] === tool ? ' on' : ''}`}
            type="button"
            aria-label={t[1]}
            onClick={() => {
              setTool(t[0]);
              if (t[0] === 'photo') toast('Drop a photo on the moodboard to add it');
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              {t[2]}
            </svg>
            <span className="tip">{t[1]}</span>
          </button>
        ),
      )}
    </div>
  );
}
