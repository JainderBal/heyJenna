/** Left panel: file name (double-click to rename), Pages (Floor plan + one per room), Layers of the current page. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatchProject } from '../api/hooks';
import { errorText } from '../api/client';
import type { Project } from '../api/types';
import { frameOfSel, toast, useEditorStore } from '../app/useEditorStore';
import { LAYER_ICONS, Plus, Search, Twisty } from './icons';
import type { Frame, Page } from './model';

interface Props {
  project: Project | undefined;
  pages: Page[];
  frames: Frame[];
  onFrameOpen?: (f: Frame) => void;
  /** Hide the panel (a drawer on phones and tablets). */
  onCollapse?: () => void;
}

export function LeftPanel({ project, pages, frames, onFrameOpen, onCollapse }: Props) {
  const navigate = useNavigate();
  const page = useEditorStore((s) => s.page);
  const goPage = useEditorStore((s) => s.goPage);
  const cur = pages.find((p) => p.id === page) ?? pages[0];

  return (
    <aside className="left" aria-label="File">
      <div className="file">
        <FileName project={project} />
        <button className="ibtn" type="button" aria-label="Collapse panel" onClick={onCollapse}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M6 3v10" /></svg>
        </button>
        <div className="meta">
          <button className="back" type="button" onClick={() => navigate('/projects')}>
            ← All projects
          </button>
        </div>
      </div>
      <div className="sec-h">
        Pages{' '}
        <span className="cnt" style={{ marginRight: 'auto', marginLeft: 6 }}>
          {pages.length}
        </span>
        <div className="acts">
          <button className="ibtn" type="button" aria-label="Search pages" onClick={() => toast('Coming soon')}>
            <Search />
          </button>
          <button
            className="ibtn"
            type="button"
            aria-label="Add room"
            onClick={() => {
              if (project) useEditorStore.getState().setAddingRooms(project.id);
              goPage('plan', 'plan');
              toast('Rooms come from your floor plan: read a photo or draw one');
            }}
          >
            <Plus />
          </button>
        </div>
      </div>
      <div className="pages">
        {pages.map((p) => (
          <button key={p.id} className={`page${p.id === cur?.id ? ' on' : ''}`} type="button" onClick={() => goPage(p.id)}>
            {p.room ? <span className="pdot" style={{ background: p.color }} /> : <span className="pdot plan">{LAYER_ICONS.plan}</span>}
            <span className="nm">{p.name}</span>
            {p.meta && <span className="cnt">{p.meta}</span>}
          </button>
        ))}
      </div>
      <div className="sec-h">
        Layers<span id="layersH">{cur?.name}</span>
      </div>
      <Layers frames={frames} onFrameOpen={onFrameOpen} />
    </aside>
  );
}

function FileName({ project }: { project: Project | undefined }) {
  const [editing, setEditing] = useState(false);
  const patch = usePatchProject(project?.id ?? '');
  const save = (name: string) => {
    setEditing(false);
    const v = name.trim();
    if (!project || !v || v === project.name) return;
    patch.mutate({ name: v }, { onError: (e) => toast(errorText(e)) });
  };
  return (
    <div className="name">
      {editing ? (
        <input
          autoFocus
          defaultValue={project?.name}
          aria-label="Project name"
          style={{ font: 'inherit', border: '1px solid var(--select)', borderRadius: 4, padding: '1px 4px', width: '100%' }}
          onBlur={(e) => save(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save(e.currentTarget.value);
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span onDoubleClick={() => project && setEditing(true)} title="Double-click to rename">
          {patch.isPending ? (patch.variables?.name ?? project?.name) : (project?.name ?? '…')}
        </span>
      )}{' '}
      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
    </div>
  );
}

/** The twisty layer tree: frames (level 0) and their children (level 1). */
function Layers({ frames, onFrameOpen }: { frames: Frame[]; onFrameOpen?: (f: Frame) => void }) {
  const sel = useEditorStore((s) => s.sel);
  const open = useEditorStore((s) => s.open);
  const select = useEditorStore((s) => s.select);
  const toggleOpen = useEditorStore((s) => s.toggleOpen);
  const sf = sel ? frameOfSel(sel) : null;

  const row = (id: string, name: string, lvl: 0 | 1, icon: React.ReactNode, kids: boolean, frame: Frame) => (
    <button
      key={id}
      className={`layer lv${lvl + 1}${sel === id ? ' on' : ''}${sel !== id && lvl === 0 && sf === id ? ' in' : ''}`}
      type="button"
      style={{ paddingLeft: 6 + lvl * 18 }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-tw]')) {
          toggleOpen(id);
          return;
        }
        select(id, true);
        onFrameOpen?.(frame);
      }}
    >
      {kids ? (
        <span className={`tw${open.includes(id) ? ' o' : ''}`} data-tw>
          <Twisty />
        </span>
      ) : (
        <span className="tw" />
      )}
      <span className="ic2">{icon}</span>
      <span className="nm">{name}</span>
    </button>
  );

  return (
    <div className="layers">
      {frames.flatMap((f) => [
        row(f.id, f.name, 0, LAYER_ICONS.frame, f.children.length > 0, f),
        ...(open.includes(f.id)
          ? f.children.map((c) => row(c.id, c.name, 1, c.color ? <span className="sw2" style={{ background: c.color }} /> : LAYER_ICONS[c.icon], false, f))
          : []),
      ])}
    </div>
  );
}
