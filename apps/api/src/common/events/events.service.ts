import { Injectable } from '@nestjs/common';

export type RoomEventType =
  | 'listings.search.started' | 'listings.search.progress' | 'listings.search.finished' | 'listings.search.failed'
  | 'layout.generated' | 'layout.object.added' | 'layout.object.moved' | 'layout.object.removed'
  | 'render.queued' | 'render.running' | 'render.done' | 'render.failed'
  | 'job.queued' | 'job.running' | 'job.done' | 'job.failed';

/** What the UI receives on GET /rooms/:roomId/events (one JSON object per SSE `data:` line). */
export interface RoomEvent<D = Record<string, unknown>> {
  type: RoomEventType;
  roomId: string;
  at: string; // ISO time
  data: D;
}

type Listener = (e: RoomEvent) => void;

/**
 * Per-room pub/sub for live updates. In memory: it only reaches clients connected to this API
 * process. With more than one API instance, publish through Postgres LISTEN/NOTIFY (or Redis)
 * and fan out here instead.
 */
@Injectable()
export class RoomEventsService {
  private readonly rooms = new Map<string, Set<Listener>>();

  publish(roomId: string, type: RoomEventType, data: Record<string, unknown> = {}): RoomEvent {
    const event: RoomEvent = { type, roomId, at: new Date().toISOString(), data };
    for (const listener of [...(this.rooms.get(roomId) ?? [])]) {
      try {
        listener(event);
      } catch {
        // one broken connection must not stop the others
      }
    }
    return event;
  }

  /** Returns the unsubscribe function. */
  subscribe(roomId: string, listener: Listener): () => void {
    let set = this.rooms.get(roomId);
    if (!set) this.rooms.set(roomId, (set = new Set()));
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0 && this.rooms.get(roomId) === set) this.rooms.delete(roomId);
    };
  }

  listenerCount(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }
}
