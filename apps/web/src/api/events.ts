/**
 * Live updates for one room: EventSource on GET /api/rooms/:id/events. Each event invalidates the
 * queries it makes stale, so components just read their hooks.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiUrl, devUser } from './client';
import { qk } from './hooks';
import type { RenderJob, RoomEvent } from './types';

type Listener = (e: RoomEvent) => void;

/**
 * Subscribe to a room's events. `onEvent` is optional (e.g. a toast when a search finishes);
 * query invalidation happens either way.
 */
export function useRoomEvents(roomId: string | undefined, onEvent?: Listener) {
  const qc = useQueryClient();
  const listener = useRef(onEvent);
  listener.current = onEvent;
  useEffect(() => {
    if (!roomId || typeof EventSource === 'undefined') return;
    // EventSource can't send headers: in AUTH_MODE=dev the user goes in ?dev_user= instead.
    const es = new EventSource(apiUrl(`/rooms/${roomId}/events`, { dev_user: devUser() }));
    es.onmessage = (m) => {
      let e: RoomEvent;
      try {
        e = JSON.parse(m.data) as RoomEvent;
      } catch {
        return;
      }
      const data = e.data as Record<string, unknown>;
      const layoutId = typeof data.layoutId === 'string' ? data.layoutId : undefined;
      const jobId = typeof data.jobId === 'string' ? data.jobId : undefined;
      switch (e.type) {
        case 'listings.search.finished':
        case 'listings.search.failed':
          qc.invalidateQueries({ queryKey: qk.listings(roomId) });
          break;
        case 'layout.generated':
        case 'layout.object.added':
        case 'layout.object.moved':
        case 'layout.object.removed':
          qc.invalidateQueries({ queryKey: qk.layouts(roomId) }); // covers each layout + its shopping list
          if (layoutId) qc.invalidateQueries({ queryKey: qk.layout(roomId, layoutId) });
          break;
        case 'render.queued':
        case 'render.running':
        case 'render.done':
        case 'render.failed': {
          // data.job is the job as GET /rooms/:roomId/renders/:jobId shows it
          const job = data.job as RenderJob | undefined;
          if (job?.id) qc.setQueryData(qk.render(roomId, job.id), job);
          qc.invalidateQueries({ queryKey: qk.renders(roomId), exact: true });
          break;
        }
        case 'job.done':
        case 'job.failed':
          // a background search (?async=1) ends as a job too
          if (jobId) qc.invalidateQueries({ queryKey: qk.listings(roomId) });
          break;
        default:
          break;
      }
      listener.current?.(e);
    };
    return () => es.close();
  }, [roomId, qc]);
}
