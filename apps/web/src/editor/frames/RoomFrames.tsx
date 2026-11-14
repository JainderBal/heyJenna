/** Room page frames: Moodboard, Palette, 3D room (live or the render's room), Shopping list. */
import { useState } from 'react';
import { useAddMoodboardPins, useDeleteMoodboardImage, useMoodboardImages, useCreateLayout, useCreateRender, useRenderImage, useRenderJob, useRenders, useSearchListingsAsync, useUploadMoodboard } from '../../api/hooks';
import { errorText } from '../../api/client';
import type { Layout, Listing, PinRef, RenderJob, Room, StyleResponse } from '../../api/types';
import { openPinterestWindow } from '../../app/openPinterest';
import { toast, useEditorStore } from '../../app/useEditorStore';
import { RoomViewer, type RenderModelState } from '../../viewer/RoomViewer';
import { shade } from '../colour';
import { listRows, money, shortTitle } from '../model';
import { SwapPicker } from '../SwapPicker';

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
const PIN_DRAG_TYPE = 'application/x-hj-pin';

/** First i.pinimg.com image address in dragged text or HTML, upgraded to the 736px size. */
export function pinimgFrom(text: string): string | null {
  const m = text.match(/https:\/\/i\.pinimg\.com\/[^\s"'<>)]+\.(?:jpe?g|png|webp|gif)/i);
  return m ? m[0].replace(/\/(?:\d+x|originals)\//, '/736x/') : null;
}

export function MoodboardFrame({ room, style, palette }: { room: Room; style: StyleResponse | null | undefined; palette: string[] }) {
  const local = useEditorStore((s) => s.moodPreviews[room.id]) ?? [];
  const stored = useMoodboardImages(room.id).data ?? [];
  const removeImg = useDeleteMoodboardImage(room.id);
  // what the API has stored wins; this session's object URLs only fill in while it loads
  const previews = stored.length ? stored.map((i) => i.src) : local;
  const setPreviews = useEditorStore((s) => s.setMoodPreviews);
  const upload = useUploadMoodboard(room.id);
  const addPins = useAddMoodboardPins(room.id);
  const [over, setOver] = useState(false);
  const busy = upload.isPending || addPins.isPending;
  const count = style?.imageCount ?? 0;

  /** Drops and "Add images" add to the board; "Replace board" starts it again from these images. */
  function send(files: File[], replace = false) {
    const imgs = files.filter((f) => f.type.startsWith('image/')).slice(0, MAX_IMAGES);
    if (!imgs.length) return toast('Drop images (jpg, png, webp…)');
    if (files.length > MAX_IMAGES) toast(`Up to ${MAX_IMAGES} images: using the first ${MAX_IMAGES}`);
    upload.mutate(
      { files: imgs, append: !replace },
      {
        onSuccess: (s) => {
          if (replace) setPreviews(room.id, imgs.map((f) => URL.createObjectURL(f)));
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
    // an image dragged in from the real pinterest.com (the docked Pinterest window): take its i.pinimg.com address
    const fromPinterest = pinimgFrom(e.dataTransfer.getData('text/uri-list') + ' ' + e.dataTransfer.getData('text/html'));
    if (fromPinterest && !e.dataTransfer.files.length) {
      const id = 'drop-' + (fromPinterest.split('/').pop() || Date.now()).toString().replace(/\.\w+$/, '');
      addPins.mutate([{ id, imageUrl: fromPinterest }], { onSuccess: () => toast('Pin added to the moodboard'), onError: (er) => toast(errorText(er)) });
      return;
    }
    send([...e.dataTransfer.files]);
  }

  const pick = (replace = false) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/*';
    i.multiple = true;
    i.onchange = () => send([...(i.files ?? [])], replace);
    i.click();
  };

  return (
    <div
      style={{ height: '100%', boxShadow: over ? 'inset 0 0 0 3px var(--select)' : undefined }}
      onDragOver={(e) => {
        const t = [...e.dataTransfer.types];
        if (!t.includes('Files') && !t.includes(PIN_DRAG_TYPE) && !t.includes('text/uri-list')) return;
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
        <button className="pbtn sm" type="button" onClick={openPinterestWindow}>
          Open Pinterest
        </button>
        <button className="pbtn sm" type="button" disabled={busy} onClick={() => pick()}>
          {count ? 'Add images' : 'Upload images'}
        </button>
        {count > 0 && (
          <button className="pbtn sm" type="button" disabled={busy} onClick={() => pick(true)} title="Start the board again from new images">
            Replace board
          </button>
        )}
      </div>
      <div className="mood">
        {MOOD.map(([size, pi, label], n) => {
          const src = previews[n];
          if (src)
            return (
              <div key={n} className={`tile ${size}`}>
                <img className="shot" alt="" src={src} />
                {stored[n] && (
                  <button
                    className="tile-x"
                    type="button"
                    aria-label="Remove image"
                    title="Remove image"
                    disabled={removeImg.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImg.mutate(stored[n].id, { onError: (er) => toast(errorText(er)) });
                    }}
                  >
                    ×
                  </button>
                )}
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
  const renders = useRenders(room.id);
  // newest first: this session's job, then the room's history
  const jobs = [job.data, ...(renders.data ?? [])].filter((j): j is RenderJob => !!j).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = jobs[0];
  // what's on screen stays until a newer render is done
  const shown = jobs.find((j) => j.status === 'done' && j.modelUrl);
  const photoJob = jobs.find((j) => j.status === 'done' && j.imageUrl);
  const img = useRenderImage(photoJob);
  // the render is the default; "Live" is remembered per render, so a new render comes up as the render again
  const [liveFor, setLiveFor] = useState<string | null>(null);
  const [modelState, setModelState] = useState<RenderModelState>('none');
  const mode = shown && liveFor !== shown.id ? 'render' : 'live';
  const status = create.isPending ? 'queued' : latest?.status;
  const working = status === 'queued' || status === 'running';
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  function render() {
    if (!layout) return toast('Lay out the room first');
    create.mutate(layout.id, {
      onSuccess: (j) => {
        setJob(room.id, j.id);
        toast('Render queued: the 3D keeps spinning while the worker renders (~45 s)');
      },
      onError: (e) => toast(errorText(e)),
    });
  }

  return (
    <div className="viewer" aria-label={`3D model of the ${room.name.toLowerCase()}`}>
      <RoomViewer
        roomId={room.id}
        layout={layout ?? null}
        room={room}
        palette={palette}
        render={shown?.modelUrl ? { jobId: shown.id, path: shown.modelUrl } : null}
        mode={mode}
        onRenderState={setModelState}
        editable
      />
      <div className="vbtns" style={{ left: 'auto', right: 12, top: 12, bottom: 'auto', transform: 'none' }}>
        {shown && (
          <>
            <button type="button" className={mode === 'render' ? 'on' : ''} disabled={modelState === 'error'} title="The rendered room" onPointerDown={stop} onClick={() => setLiveFor(null)}>
              Render 3D
            </button>
            <button type="button" className={mode === 'live' ? 'on' : ''} title="The live room: follows your layout edits" onPointerDown={stop} onClick={() => setLiveFor(shown.id)}>
              Live
            </button>
          </>
        )}
        <button type="button" disabled={!layout || working} title={layout ? 'Render the room in Blender' : 'Lay out the room first'} onPointerDown={stop} onClick={render}>
          {working ? (status === 'running' ? 'Rendering…' : 'Queued…') : status === 'failed' ? 'Render again' : shown || img ? 'Re-render' : 'Render'}
        </button>
      </div>
      {working && <span className="vstatus" style={{ top: 52 }}>{status === 'running' ? 'Rendering a new version…' : 'New render queued…'}</span>}
      {!working && status === 'failed' && <span className="vstatus" style={{ top: 52 }}>{latest?.error?.split('\n')[0] ?? 'Render failed'}</span>}
      {!working && status !== 'failed' && mode === 'render' && modelState === 'error' && <span className="vstatus" style={{ top: 52 }}>Couldn’t load the render’s 3D model: showing the live room</span>}
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
  const [swapping, setSwapping] = useState<string | null>(null);

  return (
    // the frame is sized to the list; while a swap is open the list scrolls inside it (wheel included)
    <div className={`list${swapping ? ' scroll' : ''}`} data-own-wheel={swapping ? '' : undefined}>
      <h4>Shopping list</h4>
      {!rows.length && (
        <p className="empty">
          {found
            ? `${found} products found. Pick some, or lay out the room and jenna picks the best match for each spot.`
            : 'Nothing yet. Find products in your moodboard’s style, then lay out the room.'}
        </p>
      )}
      {rows.map((r) => (
        <div key={r.id}>
          <div className="row2">
            {r.imageUrl ? <img alt="" src={r.imageUrl} loading="lazy" referrerPolicy="no-referrer" /> : <span className="ph" />}
            <div>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" title={r.title}>
                  <b>{shortTitle(r.title)}</b>
                </a>
              ) : (
                <b title={r.title}>{shortTitle(r.title)}</b>
              )}
              <small>
                {r.sub}
                {layout && (
                  <>
                    {' · '}
                    <button type="button" className="swap-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => setSwapping(swapping === r.id ? null : r.id)}>
                      Swap
                    </button>
                  </>
                )}
              </small>
            </div>
            <div className="p">{money(r.price, r.currency)}</div>
          </div>
          {layout && swapping === r.id && (
            <SwapPicker roomId={room.id} layoutId={layout.id} objectId={r.id} type={r.type} listingId={r.listingId} onClose={() => setSwapping(null)} />
          )}
        </div>
      ))}
      {rows.length > 0 && (
        <div className="total">
          <span>Total</span>
          <span>{money(total, currency)}</span>
        </div>
      )}
      <button className="pbtn dark pvbtn" type="button" onClick={() => spOpen('shop')}>
        Open live preview
      </button>
      <div className="list-acts">
        <button
          className="pbtn sm"
          type="button"
          disabled={search.isPending}
          onClick={() =>
            search.mutate({}, { onSuccess: () => toast('Searching every shop… results land here'), onError: (e) => toast(errorText(e)) })
          }
        >
          {search.isPending ? 'Starting…' : 'Find products'}
        </button>
        <button
          className="pbtn sm"
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
    </div>
  );
}
