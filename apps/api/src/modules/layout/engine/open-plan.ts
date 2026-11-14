import { FloorPlan, Wall, openWalls } from '@hey-jenna/contracts';
import { EngineResult } from './layout-engine';

/**
 * Small open-plan rooms (a living area open to the dining area) can leave the engine too few walls and too little floor
 * once the open sides are kept clear. The fallback lays the room out as if its open sides were walls (a sofa backing
 * onto the dining area is the usual open-plan arrangement), then takes down whatever would hang on a wall that isn't
 * there.
 */
export function asIfClosed(plan: FloorPlan): FloorPlan {
  const walls = Object.fromEntries(Object.entries(plan.walls).map(([w, f]) => [w, { ...f, open: undefined }]));
  return { ...plan, walls: walls as FloorPlan['walls'] };
}

/** Removes art, mirrors, shelves and accent walls placed on open sides, and hides those walls in renders. */
export function takeDownOpenWallPieces(result: EngineResult, plan: FloorPlan): { result: EngineResult; removed: string[] } {
  const open = new Set<Wall>(openWalls(plan));
  if (!open.size) return { result, removed: [] };
  const removed: string[] = [];
  const objects = result.objects.flatMap((o) => {
    const wall = (o as { wall?: Wall }).wall;
    if (o.type === 'wall' && open.has(o.zone as Wall)) return [{ ...o, render: false }];
    if (o.mount === 'wall' && wall && open.has(wall)) {
      removed.push(o.id);
      return [];
    }
    return [o];
  });
  return { result: { ...result, objects }, removed };
}
