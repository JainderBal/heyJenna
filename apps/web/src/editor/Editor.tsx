/**
 * The studio editor for one project: icon rail | left panel (pages, layers) | canvas | side panel.
 * URL: /p/:projectId?page=plan|<roomId>&sel=<frameId>[/<layer>] (kept in sync with the store).
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useLatestLayout, useListings, useProject, useProjectRooms, useRoomStyle } from '../api/hooks';
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
import { Toast } from './Toast';
import { FoundFrame, PlanFrame, RoomsIntake } from './frames/FloorPlanFrames';
import { MoodboardFrame, PaletteFrame, Room3DFrame, ShoppingListFrame } from './frames/RoomFrames';
import { pagesOf, planFrames, projectPalette, roomFrames, roomPalette, type Frame } from './model';

export function Editor() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const urlPage: PageId = params.get('page') || 'plan';
  const urlSel = params.get('sel');

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
    if (s.page !== 'plan') next.set('page', s.page);
    if (s.sel) next.set('sel', s.sel);
    setParams(next, { replace: p === s.page });
  }, [page, sel, setParams]);

  // a room page for a room that isn't in this project (deleted, bad link) → the floor plan
  useEffect(() => {
    if (roomsQ.isSuccess && page !== 'plan' && !rooms.some((r) => r.id === page)) useEditorStore.getState().goPage('plan');
  }, [roomsQ.isSuccess, rooms, page]);

  const room = page !== 'plan' ? rooms.find((r) => r.id === page) : undefined;
  const pages = useMemo(() => pagesOf(project.data, rooms), [project.data, rooms]);
  const projPal = useMemo(() => projectPalette(project.data), [project.data]);

  /* ---- current room's data ---- */
  const style = useRoomStyle(room?.id);
  const layout = useLatestLayout(room?.id);
  const listings = useListings(room?.id);
  const previews = useEditorStore((s) => (room ? s.moodPreviews[room.id] : undefined)) ?? NONE;
  const hasRender = useEditorStore((s) => !!(room && s.renderJobs[room.id]));
  const upload = useEditorStore((s) => s.planUploads[projectId]);
  const palette = useMemo(() => roomPalette(style.data, projPal), [style.data, projPal]);

  useRoomEvents(room?.id, (e: RoomEvent) => {
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

  if (isApiError(project.error, 404) || isApiError(project.error, 400)) return <Navigate to="/" replace />;

  const body = (f: Frame) => {
    switch (f.type) {
      case 'drop':
        return <RoomsIntake projectId={projectId} empty />;
      case 'add':
        return <RoomsIntake projectId={projectId} empty={false} />;
      case 'plan':
        return <PlanFrame projectId={projectId} rooms={rooms} palette={projPal} upload={upload} />;
      case 'found':
        return <FoundFrame rooms={rooms} palette={projPal} />;
      case 'mood':
        return room && <MoodboardFrame room={room} style={style.data} palette={palette} />;
      case 'pal':
        return <PaletteFrame palette={palette} />;
      case 'room3d':
        return room && <Room3DFrame room={room} layout={layout.data} palette={palette} />;
      case 'list':
        return room && <ShoppingListFrame room={room} layout={layout.data} listings={listings.data} />;
    }
  };

  return (
    <div className={`app${spTabs.length ? ' sp-on' : ''}`}>
      <Rail />
      <LeftPanel project={project.data} pages={pages} frames={frames} onFrameOpen={(f) => f.type === 'list' && useEditorStore.getState().spOpen('shop')} />
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
          <button className="share" type="button" onClick={() => toast('Sharing is coming soon')}>
            Share
          </button>
        </div>
        <Dock />
        <Toast />
      </Canvas>
      <SidePanel projectId={projectId} roomId={room?.id} />
    </div>
  );
}

const NONE: string[] = [];

const EVENT_TOASTS: Partial<Record<RoomEvent['type'], string | ((e: RoomEvent) => string)>> = {
  'listings.search.finished': (e) => (typeof e.data.listingCount === 'number' ? `found ${e.data.listingCount} products` : 'search finished: products are in'),
  'listings.search.failed': 'the product search failed',
  'render.done': 'render ready',
  'render.failed': 'the render failed',
};
