/** The icon rail on the far left: File (the canvas), jenna, Pinterest, and the project pages Assets, Sellers, Styles, Share. */
import { useNavigate } from 'react-router-dom';
import { desktop } from '../app/desktopBridge';
import { openPinterestWindow } from '../app/openPinterest';
import { useEditorStore } from '../app/useEditorStore';
import type { RailView } from '../rail/RailPage';
import { Logo } from './icons';

const sw = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 } as const;

interface Props {
  /** The rail page shown instead of the canvas, or null. */
  view: RailView | null;
  onView: (v: RailView) => void;
  /** File: back to the canvas, or show / hide the left panel. */
  onFile: () => void;
}

export function Rail({ view, onView, onFile }: Props) {
  const navigate = useNavigate();
  const tabs = useEditorStore((s) => s.spTabs);
  const spToggle = useEditorStore((s) => s.spToggle);
  const item = (v: RailView) => ({ className: `item${view === v ? ' on' : ''}`, 'aria-current': view === v ? ('page' as const) : undefined, onClick: () => onView(v) });
  return (
    <nav className="rail" aria-label="Workspace">
      <button className="logo-btn" type="button" aria-label="All projects" title="All projects" onClick={() => navigate('/projects')}>
        <Logo />
      </button>
      <button className={`item${view ? '' : ' on'}`} type="button" data-file onClick={onFile} title={view ? 'Back to the canvas' : 'Show or hide pages and layers'}>
        <span className="ic">
          <svg {...sw}><path d="M3.5 1.5h6l3 3v10h-9z" /><path d="M9.5 1.5v3h3" /></svg>
        </span>
        File
      </button>
      <button className={`item${tabs.includes('chat') ? ' on' : ''}`} type="button" onClick={() => spToggle('chat')}>
        <span className="ic">
          <svg {...sw}><path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5 6.4 9.6 1.5 8l4.9-1.6z" /></svg>
        </span>
        Jenna
      </button>
      <button
        className={`item${tabs.includes('pinterest') ? ' on' : ''}`}
        type="button"
        aria-label="Pinterest"
        onClick={desktop ? () => spToggle('pinterest') : openPinterestWindow}
      >
        <span className="ic">
          <svg {...sw}><path d="M8 1.8a4.6 4.6 0 0 1 4.6 4.6c0 3-2.5 4.3-4.6 4.3" /><path d="M8 10.7 6.6 14.4" /><path d="M8 1.8a4.6 4.6 0 0 0-4.6 4.6c0 1.1.4 2.1 1 2.8" /></svg>
        </span>
        Pinterest
      </button>
      <button type="button" {...item('assets')}>
        <span className="ic">
          <svg {...sw}><circle cx="8" cy="8" r="6" /><path d="M8 5v6M5 8h6" /></svg>
        </span>
        Assets
      </button>
      <button type="button" {...item('sellers')}>
        <span className="ic">
          <svg {...sw}><rect x="2" y="5" width="12" height="9" rx="1.5" /><path d="M5.5 5V3h5v2M2 9h12" /></svg>
        </span>
        Sellers
      </button>
      <div className="sep" />
      <button type="button" {...item('styles')}>
        <span className="ic">
          <svg {...sw}><circle cx="8" cy="8" r="2.2" /><circle cx="8" cy="8" r="6" /></svg>
        </span>
        Styles
      </button>
      <button type="button" {...item('share')}>
        <span className="ic">
          <svg {...sw}><path d="M8 10V2M5 4.5 8 1.5l3 3" /><path d="M4 7H3v7h10V7h-1" /></svg>
        </span>
        Share
      </button>
    </nav>
  );
}
