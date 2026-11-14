/**
 * One-time move of room positions an older studio kept in localStorage (`hj-plan-pos:<projectId>`)
 * to the API's `planPosition`. Runs once per project per page load; entries that reached the API (or
 * whose room already has a position there) are dropped from localStorage, failures are tried again
 * on the next load.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk, savePlanPosition } from '../api/hooks';
import type { Room } from '../api/types';
import { forgetLegacySpots, legacySpotsToMove } from './plans';

const started = new Set<string>();

export function useMoveLegacyPlanSpots(projectId: string, rooms: Room[]) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!rooms.length || started.has(projectId)) return;
    started.add(projectId);
    const placed = rooms.filter((r) => r.planPosition).map((r) => r.id);
    const todo = legacySpotsToMove(projectId, rooms);
    if (!todo.length) return forgetLegacySpots(projectId, placed);
    void Promise.allSettled(todo.map((t) => savePlanPosition(t.roomId, t.pos))).then((results) => {
      const moved = todo.filter((_, i) => results[i].status === 'fulfilled').map((t) => t.roomId);
      forgetLegacySpots(projectId, [...placed, ...moved]);
      if (moved.length) qc.invalidateQueries({ queryKey: qk.projectRooms(projectId) });
    });
  }, [projectId, rooms, qc]);
}
