/**
 * Editor UI state (not server data: that lives in react-query). The current page and selection are
 * mirrored to the URL (?page=plan|<roomId>&sel=<frameId>) by the Editor, so links and back/forward work.
 */
import { create } from 'zustand';
import { desktop } from './desktopBridge';

export type PageId = 'plan' | (string & {});
export type SideTab = 'chat' | 'shop' | 'style' | 'pinterest';
/** Pinterest is a side panel tab only in the desktop app (on the web it's a pop-up window). */
export const SIDE_TABS: SideTab[] = desktop ? ['chat', 'shop', 'style', 'pinterest'] : ['chat', 'shop', 'style'];

/** A request for the canvas to animate to a frame (or fit the page). `n` makes repeats distinct. */
export interface FocusRequest {
  target: string | 'fit';
  instant?: boolean;
  n: number;
}

interface EditorState {
  projectId: string | null;
  page: PageId;
  /** Selected frame or layer id. */
  sel: string | null;
  /** Frames expanded in the layer tree. */
  open: string[];
  /** Frames the person dragged, keyed `${projectId}:${page}:${frameId}` (see posKey). */
  pos: Record<string, { x: number; y: number }>;
  spTabs: SideTab[];
  spActive: SideTab | null;
  toast: { text: string; n: number } | null;
  focus: FocusRequest | null;
  /** Object URLs of moodboard images uploaded in this session (the API doesn't list stored images). */
  moodPreviews: Record<string, string[]>;
  /** The render job last requested per room in this session. */
  renderJobs: Record<string, string>;
  /** Object URL of the floor-plan photo uploaded in this session, per project. */
  planUploads: Record<string, string>;
  /** The project whose Plan frame shows "Add rooms" (upload / draw / sample) instead of the plan. */
  addingRooms: string | null;
  /** The product search per room this session, from its live events; `thenLayOut` lays the room out when it ends. */
  searches: Record<string, RoomSearch>;

  enterProject(id: string, page: PageId, sel: string | null): void;
  /** Go to a page (and optionally select a frame on it); the canvas fits or focuses. */
  goPage(page: PageId, sel?: string | null): void;
  select(sel: string | null, focus?: boolean): void;
  toggleOpen(frameId: string, open?: boolean): void;
  moveFrame(frameId: string, x: number, y: number): void;
  requestFocus(target: string | 'fit', instant?: boolean): void;
  spOpen(tab: SideTab): void;
  spClose(tab: SideTab): void;
  spActivate(tab: SideTab): void;
  spToggle(tab: SideTab): void;
  showToast(text: string): void;
  hideToast(): void;
  setMoodPreviews(roomId: string, urls: string[]): void;
  setRenderJob(roomId: string, jobId: string): void;
  setPlanUpload(projectId: string, url: string): void;
  /** Show (or hide) "Add rooms" in the Plan frame of this project, and focus the frame. */
  setAddingRooms(projectId: string | null): void;
  setSearch(roomId: string, patch: Partial<RoomSearch> | null): void;
}

export interface RoomSearch {
  state: 'running' | 'done' | 'failed';
  /** Furniture types searched so far, of `total` (from listings.search.progress). */
  done: number;
  total: number | null;
  error?: string;
  thenLayOut?: boolean;
}

let focusN = 0;
let toastN = 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null,
  page: 'plan',
  sel: null,
  open: [],
  pos: {},
  spTabs: [],
  spActive: null,
  toast: null,
  focus: null,
  moodPreviews: {},
  renderJobs: {},
  planUploads: {},
  addingRooms: null,
  searches: {},

  enterProject(id, page, sel) {
    if (get().projectId === id) return;
    set({ projectId: id, page, sel, open: sel ? [frameOfSel(sel)] : [], spTabs: [], spActive: null, focus: { target: sel ?? 'fit', instant: true, n: ++focusN } });
  },
  goPage(page, sel = null) {
    set({ page, sel, open: sel ? [frameOfSel(sel)] : [], focus: { target: sel ?? 'fit', n: ++focusN } });
  },
  select(sel, focus = false) {
    const open = sel && !get().open.includes(frameOfSel(sel)) && sel !== frameOfSel(sel) ? [...get().open, frameOfSel(sel)] : get().open;
    set({ sel, open, ...(focus && sel ? { focus: { target: sel, n: ++focusN } } : {}) });
  },
  toggleOpen(frameId, open) {
    const has = get().open.includes(frameId);
    const want = open ?? !has;
    if (want === has) return;
    set({ open: want ? [...get().open, frameId] : get().open.filter((x) => x !== frameId) });
  },
  moveFrame(frameId, x, y) {
    const key = posKey(get().projectId, get().page, frameId);
    set({ pos: { ...get().pos, [key]: { x, y } } });
  },
  requestFocus(target, instant) {
    set({ focus: { target, instant, n: ++focusN } });
  },
  spOpen(tab) {
    const tabs = get().spTabs.includes(tab) ? get().spTabs : [...get().spTabs, tab];
    set({ spTabs: tabs, spActive: tab });
  },
  spClose(tab) {
    const tabs = get().spTabs.filter((t) => t !== tab);
    const active = get().spActive === tab ? (tabs[tabs.length - 1] ?? null) : get().spActive;
    set({ spTabs: tabs, spActive: active });
  },
  spActivate(tab) {
    if (get().spTabs.includes(tab)) set({ spActive: tab });
  },
  spToggle(tab) {
    if (get().spTabs.includes(tab)) get().spClose(tab);
    else get().spOpen(tab);
  },
  showToast(text) {
    set({ toast: { text, n: ++toastN } });
  },
  hideToast() {
    set({ toast: null });
  },
  setMoodPreviews(roomId, urls) {
    (get().moodPreviews[roomId] ?? []).forEach((u) => URL.revokeObjectURL(u));
    set({ moodPreviews: { ...get().moodPreviews, [roomId]: urls } });
  },
  setRenderJob(roomId, jobId) {
    set({ renderJobs: { ...get().renderJobs, [roomId]: jobId } });
  },
  setAddingRooms(projectId) {
    set({ addingRooms: projectId });
  },
  setPlanUpload(projectId, url) {
    const old = get().planUploads[projectId];
    if (old && old !== url) URL.revokeObjectURL(old);
    set({ planUploads: { ...get().planUploads, [projectId]: url } });
  },
  setSearch(roomId, patch) {
    const rest = { ...get().searches };
    if (!patch) delete rest[roomId];
    else {
      const fresh: RoomSearch = { state: 'running', done: 0, total: null };
      rest[roomId] = { ...fresh, ...rest[roomId], ...patch };
    }
    set({ searches: rest });
  },
}));

/**
 * Frame ids are unique within a page (`mood`, `list`…); child layer ids are `<frameId>/<child>`
 * (see editor/model.ts), so the frame of any selection is the part before the first slash.
 */
export function frameOfSel(sel: string): string {
  const i = sel.indexOf('/');
  return i === -1 ? sel : sel.slice(0, i);
}

export const posKey = (projectId: string | null, page: PageId, frameId: string) => `${projectId}:${page}:${frameId}`;

/** Shortcut for components outside React event handlers. */
export const toast = (text: string) => useEditorStore.getState().showToast(text);
