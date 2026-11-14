/**
 * The Style tab: the current room's 55 style dials (docs/style-dials.md), grouped by section, from the
 * metadata in packages/contracts/src/style-dial-meta.ts. Sliders for numbers, a select for one choice, chips
 * for sets. Each dial says where its value came from: measured from the moodboard images, the vibe's preset,
 * or edited here. Edits show at once and are saved together with PATCH /rooms/:roomId/style after a pause.
 * "Reset" goes back to what the moodboard produced (`profile.derivedDials`; older profiles: the defaults).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleDialsPatch } from '@hey-jenna/contracts';
import { DIAL_DEFAULTS, DIAL_SECTIONS, type DialKey, type DialMeta } from '@hey-jenna/contracts/dial-meta';
import { errorText } from '../api/client';
import { usePatchStyle, useRoomStyle } from '../api/hooks';
import type { StyleProfile } from '../api/types';
import { toast } from '../app/useEditorStore';
import type { SidePanelBodyProps } from './types';
import '../styles/style-editor.css';

const SAVE_AFTER_MS = 600;
type Dials = StyleProfile['dials'];
type Value = Dials[DialKey];
/** `stored`: a profile from before derivedDials was kept, whose value differs from the default (origin unknown). */
type Origin = 'measured' | 'preset' | 'default' | 'stored' | 'edited';

const words = (v: string) => v.replace(/_/g, ' ');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const StyleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d="M2 3.5h10M2 7h10M2 10.5h10" />
    <circle cx="5" cy="3.5" r="1.3" fill="#fff" />
    <circle cx="9" cy="7" r="1.3" fill="#fff" />
    <circle cx="4" cy="10.5" r="1.3" fill="#fff" />
  </svg>
);

export function StylePanel({ roomId }: SidePanelBodyProps) {
  if (!roomId) return <p className="se-empty">Open a room to edit its style dials.</p>;
  // one editor per room, so a pending edit is saved to the room it was made in
  return <StyleEditor key={roomId} roomId={roomId} />;
}

function StyleEditor({ roomId }: { roomId: string }) {
  const style = useRoomStyle(roomId);
  const patch = usePatchStyle(roomId);
  const [draft, setDraft] = useState<StyleDialsPatch>({});
  const [sending, setSending] = useState<StyleDialsPatch>({});
  const [filter, setFilter] = useState('');
  const pending = useRef<StyleDialsPatch>({});
  pending.current = draft;

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // one PATCH at a time, in order, so an older answer never lands on top of a newer one
  const save = (body: StyleDialsPatch) => {
    if (!Object.keys(body).length) return;
    setSending((s) => ({ ...s, ...body }));
    queue.current = queue.current
      .then(() => patch.mutateAsync({ dials: body }))
      .catch((e) => toast(`Style not saved: ${errorText(e)}`))
      // keep showing the sent values until the saved style is in the cache, then let the cache speak
      .finally(() => setSending((s) => Object.fromEntries(Object.entries(s).filter(([k, v]) => !same(v, body[k as DialKey])))));
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // debounce: one PATCH with every dial changed during the pause
  useEffect(() => {
    if (!Object.keys(draft).length) return;
    const t = setTimeout(() => {
      saveRef.current(draft);
      setDraft({});
    }, SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [draft]);
  // leaving the room or closing the tab: save what is still waiting
  useEffect(() => () => saveRef.current(pending.current), []);

  const profile = style.data?.profile;
  const base: Dials = useMemo(() => ({ ...DIAL_DEFAULTS, ...(profile?.derivedDials ?? {}) }) as Dials, [profile?.derivedDials]);
  const shown: Dials = useMemo(() => ({ ...(profile?.dials ?? DIAL_DEFAULTS), ...sending, ...draft }) as Dials, [profile?.dials, sending, draft]);
  const measured = useMemo(() => new Set<string>(profile?.measuredDials ?? []), [profile?.measuredDials]);
  const known = !!profile?.derivedDials;
  const origin = (k: DialKey): Origin =>
    !same(shown[k], base[k]) ? (known ? 'edited' : 'stored') : measured.has(k) ? 'measured' : known ? 'preset' : 'default';

  const all = DIAL_SECTIONS.flatMap((s) => s.dials);
  const edited = all.filter((d) => origin(d.key) === 'edited');
  const set = (k: DialKey, v: Value) => setDraft((d) => ({ ...d, [k]: v }));
  const resetAll = () => setDraft((d) => ({ ...d, ...Object.fromEntries(edited.map((x) => [x.key, base[x.key]])) }));

  const q = filter.trim().toLowerCase();
  const sections = DIAL_SECTIONS.map((s) => ({
    ...s,
    dials: !q || s.title.toLowerCase().includes(q) ? s.dials : s.dials.filter((d) => matches(d, q)),
  })).filter((s) => s.dials.length);

  if (style.isLoading) return <p className="se-empty">Loading the style…</p>;
  if (style.isError) return <p className="se-empty">{errorText(style.error)}</p>;
  if (!profile) return <p className="se-empty">Add images to the moodboard first: the dials start from what jenna reads in them.</p>;

  const busy = patch.isPending || Object.keys(draft).length > 0;
  return (
    <div className="se">
      <div className="se-top">
        <input className="se-filter" type="search" placeholder="Filter dials" aria-label="Filter dials" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="se-btn" type="button" disabled={!edited.length} onClick={resetAll} title="Back to what the moodboard set">
          Reset all
        </button>
      </div>
      <div className="se-status">
        <span>{profile.name}</span>
        <span>{busy ? 'saving…' : edited.length ? `${edited.length} edited · saved` : known ? 'as read from the moodboard' : 'read before edits were tracked'}</span>
      </div>
      <div className="se-list">
        {sections.map((s) => (
          <details key={s.id} className="se-sec" open>
            <summary>
              {s.title}
              <small>{s.dials.filter((d) => origin(d.key) === 'edited').length || ''}</small>
            </summary>
            {s.id === 'A' && !q && (
              <div className="se-row">
                <div className="se-lab">
                  <span title="colour_roles">Colours</span>
                  <i className="se-o measured">measured</i>
                </div>
                <div className="se-sw" title="60 / 30 / 10: edit them on the Palette">
                  {[...profile.palette.dominant, ...profile.palette.secondary, ...profile.palette.accent].map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </div>
              </div>
            )}
            {s.dials.map((d) => (
              <DialRow key={d.key} meta={d} value={shown[d.key]} origin={origin(d.key)} onChange={(v) => set(d.key, v)} onReset={() => set(d.key, base[d.key])} />
            ))}
          </details>
        ))}
        {!sections.length && <p className="se-empty">No dial matches “{filter}”.</p>}
      </div>
    </div>
  );
}

function matches(d: DialMeta, q: string): boolean {
  const text = [d.label, d.key, words(d.key), ...(d.kind === 'number' ? [d.lo, d.hi] : d.options.map(words))].join(' ').toLowerCase();
  return text.includes(q);
}

function DialRow({ meta, value, origin, onChange, onReset }: { meta: DialMeta; value: Value; origin: Origin; onChange(v: Value): void; onReset(): void }) {
  return (
    <div className="se-row">
      <div className="se-lab">
        <span title={meta.key}>{meta.label}</span>
        <i className={`se-o ${origin}`}>{origin}</i>
        {(origin === 'edited' || origin === 'stored') && (
          <button
            className="se-reset"
            type="button"
            aria-label={`Reset ${meta.label}`}
            title={origin === 'edited' ? 'Back to what the moodboard set' : 'Back to the default'}
            onClick={onReset}
          >
            ↺
          </button>
        )}
      </div>
      <Control meta={meta} value={value} onChange={onChange} />
    </div>
  );
}

function Control({ meta, value, onChange }: { meta: DialMeta; value: Value; onChange(v: Value): void }) {
  if (meta.kind === 'number') {
    const v = value as number;
    const label = meta.unit ? `${v} ${meta.unit}` : meta.key === 'accent_share' ? `${Math.round(v * 100)} %` : v.toFixed(2);
    return (
      <div className="se-num">
        <input type="range" min={meta.min} max={meta.max} step={meta.step} value={v} aria-label={meta.label} onChange={(e) => onChange(Number(e.target.value))} />
        <output>{label}</output>
        <div className="se-ends">
          <span>{meta.lo}</span>
          <span>{meta.hi}</span>
        </div>
      </div>
    );
  }
  if (meta.kind === 'enum')
    return (
      <select className="se-sel" value={value as string} aria-label={meta.label} onChange={(e) => onChange(e.target.value as Value)}>
        {meta.options.map((o) => (
          <option key={o} value={o}>
            {words(o)}
          </option>
        ))}
      </select>
    );
  const picked = value as string[];
  const toggle = (o: string) => {
    if (!picked.includes(o)) return onChange([...picked, o] as Value);
    if (picked.length <= meta.min) return toast(meta.min === 1 ? 'Keep at least one' : `Keep at least ${meta.min}`);
    onChange(picked.filter((x) => x !== o) as Value);
  };
  return (
    <div className="se-chips" role="group" aria-label={meta.label}>
      {meta.options.map((o) => {
        const i = picked.indexOf(o);
        return (
          <button key={o} type="button" className={`se-chip${i >= 0 ? ' on' : ''}`} aria-pressed={i >= 0} onClick={() => toggle(o)}>
            {meta.ranked && i >= 0 && <b>{i + 1}</b>}
            {words(o)}
          </button>
        );
      })}
    </div>
  );
}
