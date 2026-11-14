/**
 * The studio editor for one project: icon rail | left panel (pages, layers) | canvas | side panel.
 * URL: /p/:projectId?page=plan|<roomId>&sel=<frameId>[/<layer>] (kept in sync with the store);
 * ?view=share|assets|sellers|styles shows a left-rail page (rail/) in the canvas's place.
 * Phones: the rail and the left panel slide in as a drawer (the ☰ button), see styles/responsive.css.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useHomeStyle, useLatestLayout, useListings, useProject, useProjectRooms, useRoomStyle } from '../api/hooks';
import { useRoomEvents } from '../api/events';
import { isApiError } from '../api/client';
import type { RoomEvent } from '../api/types';
import { toast, useEditorStore, type PageId } from '../app/useEditorStore';
import { JennaCube } from '../jenna/JennaCube';
import { SidePanel } from '../sidepanel/SidePanel';
import { Canvas } from './Canvas';
import { Dock } from './Dock';
import { LeftPanel } from './LeftPanel';
import { Rail } from './Rail';
import { useMoodboardPaste } from './useMoodboardPaste';
import { Toast } from './Toast';
import { FoundFrame, Plan3DFrame, PlanFrame } from './frames/FloorPlanFrames';
import { MoodboardFrame, PaletteFrame, Room3DFrame, ShoppingListFrame } from './frames/RoomFrames';
import { RailPage, asRailView, type RailView } from '../rail/RailPage';
import { pagesOf, planFrames, projectPalette, roomFrames, roomPalette, type Frame } from './model';

export function Editor() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const urlPage: PageId = params.get('page') || 'plan';
  const urlSel = params.get('sel');
  const view = asRailView(params.get('view'));

  const project = useProject(projectId);
  const roomsQ = useProjectRooms(projectId);
  const rooms = useMemo(() => roomsQ.data ?? [], [roomsQ.data]);

  const page = useEditorStore((s) => s.page);
  const sel = useEditorStore((s) => s.sel);
  const spTabs = useEditorStore((s) => s.spTabs);
  const enterProject = useEditorStore((s) => s.enterProject);

  /* ---- URL ⇄ store ---- */
  useEffect(() => {
    enterProject(projectId, urlPage, urlSel);
    // only when the project changes; the two effects below keep page/sel in sync after that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  useEffect(() => {
    // back / forward / a pasted link → store
    const s = useEditorStore.getState();
    if (s.page !== urlPage) s.goPage(urlPage, urlSel);
    else if (s.sel !== urlSel) s.select(urlSel, true);
  }, [urlPage, urlSel]);
  useEffect(() => {
    // store → URL (a new history entry per page, replace for selection)
    const s = useEditorStore.getState();
    const cur = new URLSearchParams(window.location.search);
    const p = cur.get('page') || 'plan';
    if (p === s.page && cur.get('sel') === s.sel) return;
    const next = new URLSearchParams();
    // a page or selection change from the canvas side also leaves a rail page
    if (s.page !== 'plan') next.set('page', s.page);
    if (s.sel) next.set('sel', s.sel);
    setParams(next, { replace: p === s.page });
  }, [page, sel, setParams]);

  // a room page for a room that isn't in this project (deleted, bad link) → the floor plan
  useEffect(() => {
    if (roomsQ.isSuccess && page !== 'plan' && !rooms.some((r) => r.id === page)) useEditorStore.getState().goPage('plan');
  }, [roomsQ.isSuccess, rooms, page]);

  const room = page !== 'plan' ? rooms.find((r) => r.id === page) : undefined;
  useMoodboardPaste(room?.id);
  const pages = useMemo(() => pagesOf(project.data, rooms), [project.data, rooms]);
  const projPal = useMemo(() => projectPalette(project.data), [project.data]);

  /* ---- current room's data ---- */
  const style = useRoomStyle(room?.id);
  const layout = useLatestLayout(room?.id);
  const listings = useListings(room?.id);
  const previews = useEditorStore((s) => (room ? s.moodPreviews[room.id] : undefined)) ?? NONE;
  const hasRender = useEditorStore((s) => !!(room && s.renderJobs[room.id]));
  const upload = useEditorStore((s) => s.planUploads[projectId]);
  // a room with no moodboard of its own is searched and laid out in the home's (the API does the same)
  const home = useHomeStyle(rooms, room?.id);
  const ownBoard = (style.data?.imageCount ?? 0) > 0;
  const shownStyle = ownBoard ? style.data : home?.style ?? style.data;
  const palette = useMemo(() => roomPalette(shownStyle, projPal), [shownStyle, projPal]);

  const setSearch = useEditorStore((s) => s.setSearch);
  useRoomEvents(room?.id, (e: RoomEvent) => {
    if (room) {
      const d = e.data as { done?: number; total?: number; error?: string };
      if (e.type === 'listings.search.started') setSearch(room.id, { state: 'running', done: 0, total: null, error: undefined });
      if (e.type === 'listings.search.progress') setSearch(room.id, { state: 'running', done: d.done ?? 0, total: d.total ?? null });
      if (e.type === 'listings.search.finished') setSearch(room.id, { state: 'done' });
      if (e.type === 'listings.search.failed') setSearch(room.id, { state: 'failed', error: d.error, thenLayOut: false });
    }
    const msg = EVENT_TOASTS[e.type];
    if (msg) toast(typeof msg === 'function' ? msg(e) : msg);
  });

  const frames: Frame[] = useMemo(
    () =>
      room
        ? roomFrames(room, { style: style.data, layout: layout.data, listings: listings.data, previews, hasRender }, palette)
        : planFrames(rooms, !!upload),
    [room, style.data, layout.data, listings.data, previews, hasRender, palette, rooms, upload],
  );

  /* ---- jenna ---- */
  const [bubble, setBubble] = useState(true);

  /* ---- rail pages, the drawer on small screens, the collapsed left panel on desktop ---- */
  const [nav, setNav] = useState(false);
  const [lpOff, setLpOff] = useState(false);
  const setView = useCallback(
    (v: RailView | null, replace = false) => {
      const next = new URLSearchParams(window.location.search);
      if (v) next.set('view', v);
      else next.delete('view');
      setParams(next, { replace });
      setNav(false);
    },
    [setParams],
  );
  const openRoom = useCallback(
    (roomId: string, sel?: string) => {
      setView(null, true);
      useEditorStore.getState().goPage(roomId, sel ?? null);
    },
    [setView],
  );
  const collapse = () => (small() ? setNav(false) : setLpOff(true));
  const onFile = () => {
    if (view) return setView(null);
    if (small()) setNav((n) => !n);
    else setLpOff((o) => !o);
  };

  if (isApiError(project.error, 404) || isApiError(project.error, 400)) return <Navigate to="/projects" replace />;

  const body = (f: Frame) => {
    switch (f.type) {
      case 'plan':
        return <PlanFrame projectId={projectId} rooms={rooms} palette={projPal} upload={upload} />;
      case 'plan3d':
        return <Plan3DFrame projectId={projectId} rooms={rooms} palette={projPal} />;
      case 'found':
        return <FoundFrame projectId={projectId} rooms={rooms} palette={projPal} />;
      case 'mood':
        return room && <MoodboardFrame room={room} style={style.data} palette={palette} />;
      case 'pal':
        return <PaletteFrame palette={palette} />;
      case 'room3d':
        return room && <Room3DFrame room={room} layout={layout.data} palette={palette} homeRoomId={home?.room.id ?? null} />;
      case 'list':
        return room && <ShoppingListFrame room={room} projectId={projectId} layout={layout.data} listings={listings.data} hasMoodboard={ownBoard} homeBoard={home?.room.name ?? null} />;
    }
  };

  return (
    <div className={`app${spTabs.length ? ' sp-on' : ''}${nav ? ' nav-on' : ''}${lpOff ? ' lp-off' : ''}${view ? ' rp-on' : ''}`}>
      {/* on phones the rail sits in the drawer: picking jenna, Pinterest… closes it (File toggles it itself) */}
      <div style={{ display: 'contents' }} onClickCapture={(e) => (e.target as HTMLElement).closest('.item:not([data-file])') && setNav(false)}>
        <Rail view={view} onView={(v) => (v === view ? setView(null) : setView(v))} onFile={onFile} />
      </div>
      {/* a page or layer click leaves a rail page (and closes the drawer on small screens) */}
      <div
        style={{ display: 'contents' }}
        onClickCapture={(e) => {
          if (!(e.target as HTMLElement).closest('.page, .layer, .back')) return;
          if (view) setView(null, true);
          setNav(false);
        }}
      >
        <LeftPanel
          project={project.data}
          pages={pages}
          frames={frames}
          onCollapse={collapse}
          onFrameOpen={(f) => f.type === 'list' && useEditorStore.getState().spOpen('shop')}
        />
      </div>
      <button className="mnav" type="button" aria-label={nav ? 'Close menu' : 'Pages and layers'} aria-expanded={nav} onClick={() => setNav((n) => !n)}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
          {nav ? <path d="M4 4l10 10M14 4 4 14" /> : <path d="M3 5h12M3 9h12M3 13h12" />}
        </svg>
      </button>
      {nav && <div className="nav-scrim" onClick={() => setNav(false)} />}
      {view ? (
        <RailPage view={view} project={project.data} rooms={rooms} projectPalette={projPal} openRoom={openRoom} />
      ) : (
        <Canvas frames={roomsQ.isLoading ? [] : frames} body={body} onFrameClick={(f) => f.type === 'list' && useEditorStore.getState().spOpen('shop')}>
          {bubble && !spTabs.includes('chat') && (
            <div className="bubble" data-overlay>
              hey! tap me to plan a room
            </div>
          )}
          <button
            className="jenna"
            type="button"
            aria-label="Open hey jenna"
            data-overlay
            onClick={() => {
              setBubble(false);
              useEditorStore.getState().spOpen('chat');
            }}
          >
            <JennaCube size={150} />
          </button>
          <div className="chip-r" data-overlay>
            <div className="avatar">J</div>
            <button className="share" type="button" onClick={() => setView('share')}>
              Share
            </button>
          </div>
          <Dock />
          <Toast />
        </Canvas>
      )}
      {view && (
        <div className="rp-toast">
          <Toast />
        </div>
      )}
      <SidePanel projectId={projectId} roomId={room?.id} />
    </div>
  );
}

const NONE: string[] = [];
/** The phone layout (styles/responsive.css): the left panel is a drawer there. */
const small = () => typeof matchMedia === 'function' && matchMedia('(max-width: 600px)').matches;

const EVENT_TOASTS: Partial<Record<RoomEvent['type'], string | ((e: RoomEvent) => string)>> = {
  'listings.search.finished': (e) => (typeof e.data.listingCount === 'number' ? `found ${e.data.listingCount} products` : 'search finished: products are in'),
  'listings.search.failed': (e) => `the product search failed${typeof e.data.error === 'string' ? `: ${e.data.error}` : ''}`,
  'render.done': 'render ready',
  'render.failed': 'the render failed',
};
