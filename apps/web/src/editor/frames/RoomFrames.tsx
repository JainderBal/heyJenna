/** Room page frames: Moodboard, Palette, 3D room (+ render), Shopping list. */
import { useState } from 'react';
import { useAddMoodboardPins, useCreateLayout, useCreateRender, useRenderImage, useRenderJob, useSearchListingsAsync, useUploadMoodboard } from '../../api/hooks';
import { errorText } from '../../api/client';
import type { Layout, Listing, PinRef, Room, StyleResponse } from '../../api/types';
import { toast, useEditorStore } from '../../app/useEditorStore';
import { RoomViewer } from '../../viewer/RoomViewer';
import { shade } from '../colour';
import { listRows } from '../model';

/** The prototype's tile layout: [size, palette index, label]. */
const MOOD: [string, number, string][] = [
  ['tall', 0, 'the vibe'],
  ['', 1, 'sofa colour'],
  ['', 2, 'wall'],
  ['', 4, 'light'],
  ['tall', 3, 'textile'],
  ['', 5, 'base'],
];
const MAX_IMAGES = 8;

/** Drag type for a Pinterest pin dropped on a moodboard: JSON PinRef `{id, imageUrl, link?}`. */
export const PIN_DRAG_TYPE = 'application/x-hj-pin';

export function MoodboardFrame({ room, style, palette }: { room: Room; style: StyleResponse | null | undefined; palette: string[] }) {
  const previews = useEditorStore((s) => s.moodPreviews[room.id]) ?? [];
  const setPreviews = useEditorStore((s) => s.setMoodPreviews);
  const upload = useUploadMoodboard(room.id);
  const addPins = useAddMoodboardPins(room.id);
  const [over, setOver] = useState(false);
  const busy = upload.isPending || addPins.isPending;
  const count = style?.imageCount ?? 0;

  function send(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith('image/')).slice(0, MAX_IMAGES);
    if (!imgs.length) return toast('Drop images (jpg, png, webp…)');
    if (files.length > MAX_IMAGES) toast(`Up to ${MAX_IMAGES} images: using the first ${MAX_IMAGES}`);
    upload.mutate(
      { files: imgs },
      {
        onSuccess: (s) => {
          setPreviews(room.id, imgs.map((f) => URL.createObjectURL(f)));
          toast(`read ${s.imageCount} images: ${s.profile.vibe.slice(0, 3).join(', ') || s.profile.name}`);
        },
        onError: (e) => toast(errorText(e)),
      },
    );
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const pin = e.dataTransfer.getData(PIN_DRAG_TYPE);
    if (pin) {
      try {
        const ref = JSON.parse(pin) as PinRef;
        addPins.mutate([ref], { onSuccess: () => toast('Pin added to the moodboard'), onError: (er) => toast(errorText(er)) });
      } catch {
        /* not ours */
      }
      return;
    }
    send([...e.dataTransfer.files]);
  }

  const pick = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/*';
    i.multiple = true;
    i.onchange = () => send([...(i.files ?? [])]);
    i.click();
  };

  return (
    <div
      style={{ height: '100%', boxShadow: over ? 'inset 0 0 0 3px var(--select)' : undefined }}
      onDragOver={(e) => {
        const t = [...e.dataTransfer.types];
        if (!t.includes('Files') && !t.includes(PIN_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={onDrop}
    >
      <div className="note mood-h">
        <span>{room.name.toLowerCase()} · the vibe</span>
        <span className="mcount">{busy ? 'reading…' : count ? `${count} images` : 'empty'}</span>
        <button className="pbtn sm" type="button" disabled={busy} onClick={pick}>
          {count ? 'Replace images' : 'Upload images'}
        </button>
      </div>
      <div className="mood">
        {MOOD.map(([size, pi, label], n) => {
          const src = previews[n];
          if (src)
            return (
              <div key={n} className={`tile ${size}`}>
                <img className="shot" alt="" src={src} />
              </div>
            );
          const c = palette[pi % palette.length];
          const ghost = !count && !previews.length;
          return (
            <div key={n} className={`tile ${size}${ghost ? ' ghost' : ''}`} style={{ background: `linear-gradient(160deg,${c},${shade(c, -0.18)})` }}>
              <span>{ghost ? (n === 0 ? 'drop images here' : label) : count > n ? `image ${n + 1}` : label}</span>
            </div>
          );
        })}
      </div>
      {previews.length > 6 && <div className="more">+{previews.length - 6} more</div>}
    </div>
  );
}

export function PaletteFrame({ palette }: { palette: string[] }) {
  return (
    <div className="swatches">
      {palette.map((c, i) => (
        <div key={i} style={{ background: c }}>
          <small>{c}</small>
        </div>
      ))}
    </div>
  );
}

export function Room3DFrame({ room, layout, palette }: { room: Room; layout: Layout | null | undefined; palette: string[] }) {
  const jobId = useEditorStore((s) => s.renderJobs[room.id]);
  const setJob = useEditorStore((s) => s.setRenderJob);
  const create = useCreateRender(room.id);
  const job = useRenderJob(room.id, jobId);
  const img = useRenderImage(job.data);
  const [showRender, setShowRender] = useState(true);
  const status = create.isPending ? 'queued' : job.data?.status;
  const working = status === 'queued' || status === 'running';

  function render() {
    if (!layout) return toast('Lay out the room first');
    create.mutate(layout.id, {
      onSuccess: (j) => {
        setJob(room.id, j.id);
        setShowRender(true);
        toast('Render queued: the worker picks it up (~45 s)');
      },
      onError: (e) => toast(errorText(e)),
    });
  }

  return (
    <div className="viewer" aria-label={`Live 3D model of the ${room.name.toLowerCase()}`}>
      <RoomViewer roomId={room.id} layout={layout ?? null} room={room} palette={palette} />
      {img && showRender && <img className="render-img" src={img} alt={`Render of the ${room.name.toLowerCase()}`} />}
      <div className="vbtns" style={{ left: 'auto', right: 12, top: 12, bottom: 'auto', transform: 'none' }}>
        {img && (
          <button type="button" className={showRender ? 'on' : ''} onClick={() => setShowRender((v) => !v)}>
            {showRender ? 'Render' : '3D'}
          </button>
        )}
        <button type="button" disabled={!layout || working} title={layout ? 'Render a photo-real PNG' : 'Lay out the room first'} onClick={render}>
          {working ? (status === 'running' ? 'Rendering…' : 'Queued…') : status === 'failed' ? 'Render again' : img ? 'Re-render' : 'Render'}
        </button>
      </div>
      {status === 'failed' && <span className="vstatus" style={{ top: 52 }}>{job.data?.error ?? 'Render failed'}</span>}
    </div>
  );
}

export function ShoppingListFrame({ room, layout, listings }: { room: Room; layout: Layout | null | undefined; listings: Listing[] | undefined }) {
  const search = useSearchListingsAsync(room.id);
  const lay = useCreateLayout(room.id);
  const spOpen = useEditorStore((s) => s.spOpen);
  const rows = listRows({ layout, listings });
  const total = layout ? layout.shoppingList.total : rows.reduce((a, r) => a + (r.price ?? 0), 0);
  const currency = layout?.shoppingList.currency ?? rows[0]?.currency ?? 'CAD';
  const found = listings?.length ?? 0;

  return (
    <div className="list">
      <h4>Shopping list</h4>
      {!rows.length && (
        <p className="empty">
          {found
            ? `${found} products found. Pick some, or lay out the room and jenna picks the best match for each spot.`
            : 'Nothing yet. Find products in your moodboard’s style, then lay out the room.'}
        </p>
      )}
      {rows.map((r) => (
        <div key={r.id} className="row2">
          {r.imageUrl ? <img alt="" src={r.imageUrl} loading="lazy" referrerPolicy="no-referrer" /> : <span className="ph" />}
          <div>
            {r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                <b>{r.title}</b>
              </a>
            ) : (
              <b>{r.title}</b>
            )}
            <small>{r.sub}</small>
          </div>
          <div className="p">{money(r.price, r.currency)}</div>
        </div>
      ))}
      {rows.length > 0 && (
        <div className="total">
          <span>Total</span>
          <span>{money(total, currency)}</span>
        </div>
      )}
      <div className="list-acts">
        <button
          className="pbtn"
          type="button"
          disabled={search.isPending}
          onClick={() =>
            search.mutate({}, { onSuccess: () => toast('Searching every shop… results land here'), onError: (e) => toast(errorText(e)) })
          }
        >
          {search.isPending ? 'Starting…' : 'Find products'}
        </button>
        <button
          className="pbtn"
          type="button"
          disabled={lay.isPending}
          onClick={() =>
            lay.mutate(undefined, {
              onSuccess: (l) => toast(`placed ${l.objects.length} pieces · ${l.summary.pass} checks pass${l.summary.fail ? `, ${l.summary.fail} fail` : ''}`),
              onError: (e) => toast(errorText(e)),
            })
          }
        >
          {lay.isPending ? 'Laying out…' : layout ? 'Lay out again' : 'Lay out the room'}
        </button>
      </div>
      <button className="pbtn dark pvbtn" type="button" onClick={() => spOpen('shop')}>
        Open live preview
      </button>
    </div>
  );
}

/** $180 / $34.50; a currency code Intl doesn't know falls back to "180 XYZ". */
export function money(v: number | null, currency = 'CAD'): string {
  if (v === null) return '—';
  const digits = v % 1 ? 2 : 0;
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${v.toFixed(digits)} ${currency}`;
  }
}
