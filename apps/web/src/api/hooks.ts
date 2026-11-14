/**
 * react-query hooks for every API call the studio makes. Query keys live in `qk` so the events
 * stream (events.ts) and mutations invalidate the same things.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { BulkRoomInput, ChatTurn, FurnitureType, ProjectInput, StyleDialsPatch, Wall } from '@hey-jenna/contracts';
import { api, apiBlob, isApiError } from './client';
import type {
  ChatResponse,
  EditResult,
  FloorPlanReadResult,
  JobAccepted,
  Layout,
  Listing,
  PinRef,
  PinterestBoard,
  PinterestPage,
  PinterestPin,
  Project,
  RenderJob,
  Room,
  SearchSummary,
  ShoppingList,
  SimilarPins,
  StyleProfile,
  StyleResponse,
} from './types';

export const qk = {
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  projectRooms: (id: string) => ['projects', id, 'rooms'] as const,
  room: (roomId: string) => ['rooms', roomId] as const,
  style: (roomId: string) => ['rooms', roomId, 'style'] as const,
  listings: (roomId: string, type?: FurnitureType) => (type ? (['rooms', roomId, 'listings', type] as const) : (['rooms', roomId, 'listings'] as const)),
  layouts: (roomId: string) => ['rooms', roomId, 'layouts'] as const,
  layout: (roomId: string, layoutId: string) => ['rooms', roomId, 'layouts', layoutId] as const,
  shoppingList: (roomId: string, layoutId: string) => ['rooms', roomId, 'layouts', layoutId, 'shopping-list'] as const,
  renders: (roomId: string) => ['rooms', roomId, 'renders'] as const,
  render: (roomId: string, jobId: string) => ['rooms', roomId, 'renders', jobId] as const,
  pinterestBoards: (bookmark?: string) => ['pinterest', 'boards', bookmark ?? ''] as const,
  pinterestPins: (boardId: string, bookmark?: string) => ['pinterest', 'boards', boardId, 'pins', bookmark ?? ''] as const,
};

type Opts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>;

/* ---------------- projects ---------------- */

export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api<Project[]>('/projects') });

export const useProject = (id: string | undefined) =>
  useQuery({ queryKey: qk.project(id ?? ''), queryFn: () => api<Project>(`/projects/${id}`), enabled: !!id });

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectInput) => api<Project>('/projects', { method: 'POST', body: input }),
    onSuccess: (p) => {
      qc.setQueryData(qk.project(p.id), p);
      qc.invalidateQueries({ queryKey: qk.projects, exact: true });
    },
  });
}

export type ProjectPatch = Partial<Omit<ProjectInput, 'kind'>> & { kind?: string | null };

export function usePatchProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProjectPatch) => api<Project>(`/projects/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (p) => {
      qc.setQueryData(qk.project(id), p);
      qc.invalidateQueries({ queryKey: qk.projects, exact: true });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: qk.project(id) });
      qc.invalidateQueries({ queryKey: qk.projects, exact: true });
    },
  });
}

/* ---------------- rooms ---------------- */

export const useProjectRooms = (projectId: string | undefined) =>
  useQuery({ queryKey: qk.projectRooms(projectId ?? ''), queryFn: () => api<Room[]>(`/projects/${projectId}/rooms`), enabled: !!projectId });

/** POST /projects/:id/rooms/bulk (all or nothing). */
export function useBulkCreateRooms(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rooms: BulkRoomInput[]) => api<Room[]>(`/projects/${projectId}/rooms/bulk`, { method: 'POST', body: { rooms } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projectRooms(projectId) }),
  });
}

/**
 * POST /projects/:id/floor-plan (multipart `image`). Preview by default; `create: true` adds
 * ?create=1 so the rooms are created too. 422 = no ANTHROPIC_API_KEY on the API, or no rooms found.
 */
export function useReadFloorPlan(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, imageUrl, create }: { file?: File; imageUrl?: string; create?: boolean }) => {
      const form = new FormData();
      if (file) form.append('image', file);
      if (imageUrl) form.append('imageUrl', imageUrl);
      return api<FloorPlanReadResult>(`/projects/${projectId}/floor-plan`, { method: 'POST', body: form, query: { create: create ? 1 : undefined } });
    },
    onSuccess: (r) => {
      if (r.created) qc.invalidateQueries({ queryKey: qk.projectRooms(projectId) });
    },
  });
}

/* ---------------- style / moodboard ---------------- */

/** The room's style profile; `null` while the room has no moodboard yet (the API answers 404). */
export const useRoomStyle = (roomId: string | undefined) =>
  useQuery({
    queryKey: qk.style(roomId ?? ''),
    enabled: !!roomId,
    queryFn: async () => {
      try {
        return await api<StyleResponse>(`/rooms/${roomId}/style`);
      } catch (e) {
        if (isApiError(e, 404)) return null;
        throw e;
      }
    },
  });

/** PATCH /rooms/:roomId/style body (apps/api …/update-style.dto.ts). */
export type StylePatch = Partial<Pick<StyleProfile, 'name' | 'keywords' | 'vibe' | 'palette' | 'shapeFamily'>> & {
  stylingDensity?: 'sparse' | 'balanced' | 'layered';
  dials?: StyleDialsPatch;
};

export function usePatchStyle(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: StylePatch) =>
      api<StyleResponse>(`/rooms/${roomId}/style`, { method: 'PATCH', body: patch }),
    onSuccess: (s) => qc.setQueryData(qk.style(roomId), s),
  });
}

/** POST /rooms/:roomId/moodboard (multipart `images`, optional `imageUrls` JSON). Replaces the board. */
export function useUploadMoodboard(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ files, imageUrls }: { files: File[]; imageUrls?: string[] }) => {
      const form = new FormData();
      files.forEach((f) => form.append('images', f));
      if (imageUrls?.length) form.append('imageUrls', JSON.stringify(imageUrls));
      return api<StyleResponse>(`/rooms/${roomId}/moodboard`, { method: 'POST', body: form });
    },
    onSuccess: (s) => qc.setQueryData(qk.style(roomId), s),
  });
}

/** POST /rooms/:roomId/moodboard/pins: add Pinterest pins (max 8 images on the board in total). */
export function useAddMoodboardPins(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pins: PinRef[]) => api<StyleResponse>(`/rooms/${roomId}/moodboard/pins`, { method: 'POST', body: { pins } }),
    onSuccess: (s) => qc.setQueryData(qk.style(roomId), s),
  });
}

/** POST /rooms/:roomId/pins/similar: rank pins by colour distance to the room's palette. */
export const useSimilarPins = (roomId: string) =>
  useMutation({ mutationFn: (pins: PinRef[]) => api<SimilarPins>(`/rooms/${roomId}/pins/similar`, { method: 'POST', body: { pins } }) });

/* ---------------- listings ---------------- */

export const useListings = (roomId: string | undefined, type?: FurnitureType) =>
  useQuery({ queryKey: qk.listings(roomId ?? '', type), queryFn: () => api<Listing[]>(`/rooms/${roomId}/listings`, { query: { type } }), enabled: !!roomId });

export interface SearchInput {
  types?: FurnitureType[];
  perType?: number;
  maxPrice?: number;
}

/** Search every source in the background (?async=1 → 202 {jobId}); the events stream refreshes listings when it's done. */
export function useSearchListingsAsync(roomId: string) {
  return useMutation({
    mutationFn: (input: SearchInput = {}) => api<JobAccepted>(`/rooms/${roomId}/listings/search`, { method: 'POST', body: input, query: { async: 1 } }),
  });
}

/** Search and wait for the result (can take a while). */
export function useSearchListings(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SearchInput = {}) => api<SearchSummary>(`/rooms/${roomId}/listings/search`, { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.listings(roomId) }),
  });
}

export function useAddListingLink(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; type?: FurnitureType }) => api<Listing>(`/rooms/${roomId}/listings/link`, { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.listings(roomId) }),
  });
}

export function usePickListing(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, picked }: { listingId: string; picked: boolean }) =>
      api<Listing>(`/rooms/${roomId}/listings/${listingId}`, { method: 'PATCH', body: { picked } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.listings(roomId) }),
  });
}

/* ---------------- layouts ---------------- */

export const useLayouts = (roomId: string | undefined) =>
  useQuery({ queryKey: qk.layouts(roomId ?? ''), queryFn: () => api<Layout[]>(`/rooms/${roomId}/layouts`), enabled: !!roomId });

/** The newest layout of a room (the API lists newest first), or null. */
export function useLatestLayout(roomId: string | undefined) {
  const q = useLayouts(roomId);
  return { ...q, data: q.data ? (q.data[0] ?? null) : undefined };
}

export const useLayout = (roomId: string | undefined, layoutId: string | undefined, opts?: Opts<Layout>) =>
  useQuery({
    queryKey: qk.layout(roomId ?? '', layoutId ?? ''),
    queryFn: () => api<Layout>(`/rooms/${roomId}/layouts/${layoutId}`),
    enabled: !!roomId && !!layoutId,
    ...opts,
  });

export function useCreateLayout(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Layout>(`/rooms/${roomId}/layouts`, { method: 'POST' }),
    onSuccess: (l) => {
      qc.setQueryData(qk.layout(roomId, l.id), l);
      qc.setQueryData<Layout[]>(qk.layouts(roomId), (old) => [l, ...(old ?? []).filter((x) => x.id !== l.id)]);
    },
  });
}

export type ObjectEdit =
  | { x?: number; y?: number; rotationDeg?: number }
  | { listingId: string }
  | { wall?: Wall; position?: number; height?: number };

/** Move / turn / swap / re-hang one piece. Answers the whole layout plus warnings. */
export function usePatchLayoutObject(roomId: string, layoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ objectId, edit }: { objectId: string; edit: ObjectEdit }) =>
      api<EditResult>(`/rooms/${roomId}/layouts/${layoutId}/objects/${encodeURIComponent(objectId)}`, { method: 'PATCH', body: edit }),
    onSuccess: (r) => {
      qc.setQueryData(qk.layout(roomId, layoutId), r.layout);
      qc.setQueryData<Layout[]>(qk.layouts(roomId), (old) => old?.map((l) => (l.id === layoutId ? r.layout : l)));
      qc.invalidateQueries({ queryKey: qk.shoppingList(roomId, layoutId) });
    },
  });
}

export const useShoppingList = (roomId: string | undefined, layoutId: string | undefined) =>
  useQuery({
    queryKey: qk.shoppingList(roomId ?? '', layoutId ?? ''),
    queryFn: () => api<ShoppingList>(`/rooms/${roomId}/layouts/${layoutId}/shopping-list`),
    enabled: !!roomId && !!layoutId,
  });

/* ---------------- renders ---------------- */

export function useCreateRender(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (layoutId: string) => api<RenderJob>(`/rooms/${roomId}/layouts/${layoutId}/renders`, { method: 'POST' }),
    onSuccess: (j) => {
      qc.setQueryData(qk.render(roomId, j.id), j);
      qc.invalidateQueries({ queryKey: qk.renders(roomId), exact: true });
    },
  });
}

export const useRenders = (roomId: string | undefined) =>
  useQuery({ queryKey: qk.renders(roomId ?? ''), queryFn: () => api<RenderJob[]>(`/rooms/${roomId}/renders`), enabled: !!roomId });

/** One render job; polls every 2 s until it is done or failed (events also refresh it). */
export const useRenderJob = (roomId: string | undefined, jobId: string | undefined) =>
  useQuery({
    queryKey: qk.render(roomId ?? '', jobId ?? ''),
    queryFn: () => api<RenderJob>(`/rooms/${roomId}/renders/${jobId}`),
    enabled: !!roomId && !!jobId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'done' || s === 'failed' ? false : 2000;
    },
  });

/** The finished render's PNG as an object URL (fetched with the login header). */
export function useRenderImage(job: RenderJob | null | undefined): string | null {
  const path = job?.status === 'done' ? job.imageUrl : null;
  const q = useQuery({ queryKey: ['blob', path], queryFn: () => apiBlob(path!), enabled: !!path, staleTime: Infinity });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data) return setUrl(null);
    const u = URL.createObjectURL(q.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [q.data]);
  return url;
}

/* ---------------- chat ---------------- */

/** POST /rooms/:roomId/chat. The server keeps no history: send it back each time. */
export function useChat(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ message, history = [] }: { message: string; history?: ChatTurn[] }) =>
      api<ChatResponse>(`/rooms/${roomId}/chat`, { method: 'POST', body: { message, history } }),
    onSuccess: (r) => {
      for (const a of r.actions) {
        if (a.type === 'style_updated') qc.invalidateQueries({ queryKey: qk.style(roomId) });
        if (a.type === 'listings_searched') qc.invalidateQueries({ queryKey: qk.listings(roomId) });
        if (a.type === 'layout_generated') qc.invalidateQueries({ queryKey: qk.layouts(roomId) });
      }
    },
  });
}

/* ---------------- pinterest ---------------- */

/** 501 when the API has no PINTEREST_ACCESS_TOKEN: check `isApiError(error, 501)`. */
export const usePinterestBoards = (bookmark?: string) =>
  useQuery({
    queryKey: qk.pinterestBoards(bookmark),
    queryFn: () => api<PinterestPage<PinterestBoard>>('/pinterest/boards', { query: { bookmark } }),
    retry: (n, e) => !isApiError(e, 501) && n < 2,
  });

export const usePinterestPins = (boardId: string | undefined, bookmark?: string) =>
  useQuery({
    queryKey: qk.pinterestPins(boardId ?? '', bookmark),
    queryFn: () => api<PinterestPage<PinterestPin>>(`/pinterest/boards/${boardId}/pins`, { query: { bookmark } }),
    enabled: !!boardId,
    retry: (n, e) => !isApiError(e, 501) && n < 2,
  });

/**
 * POST /pinterest/boards/import. Being added on another branch: the body and answer are not
 * settled yet, so both are loose here. Until it lands this answers 404.
 */
export function useImportPinterestBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { boardId: string; roomId?: string; [k: string]: unknown }) =>
      api<unknown>('/pinterest/boards/import', { method: 'POST', body }),
    onSuccess: (_r, body) => {
      if (body.roomId) qc.invalidateQueries({ queryKey: qk.style(body.roomId) });
    },
  });
}
