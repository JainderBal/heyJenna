import { FloorPlan } from '@hey-jenna/contracts';
import { LayoutData, MOVABLE_LAYERS, PlacedObject } from '../layout.types';
import { Footprint, insideRoom, overlaps } from './geometry';
import { isWallType } from './walls';

export class EditError extends Error {}

const footprint = (o: PlacedObject): Footprint => ({ x: o.position.x, y: o.position.y, w: o.size.w, d: o.size.d, rotationDeg: o.rotation_deg });
const onTop = (data: LayoutData, id: string) => data.objects.filter((o) => o.on === id);
const blocking = (o: PlacedObject) => o.mount === 'floor' && MOVABLE_LAYERS.includes(o.layer) && o.type !== 'rug';

/** Warnings, not errors: the person may want two things close together. */
export function overlapWarnings(data: LayoutData, moved: PlacedObject): string[] {
  if (!blocking(moved)) return [];
  return data.objects
    .filter((o) => o.id !== moved.id && blocking(o) && overlaps(footprint(moved), footprint(o)))
    .map((o) => `${moved.id} overlaps ${o.id}`);
}

function movable(data: LayoutData, id: string): PlacedObject {
  const o = data.objects.find((x) => x.id === id);
  if (!o) throw new EditError(`No object "${id}" in this layout`);
  if (!MOVABLE_LAYERS.includes(o.layer)) throw new EditError(`"${id}" is part of the room (${o.layer}) and can't be moved`);
  if (o.on) throw new EditError(`"${id}" sits on "${o.on}": move that instead`);
  return o;
}

/** Move and/or turn a piece. Things standing on it move with it. */
export function moveObject(data: LayoutData, plan: FloorPlan, id: string, to: { x?: number; y?: number; rotationDeg?: number }): string[] {
  const o = movable(data, id);
  const next = {
    x: to.x ?? o.position.x,
    y: to.y ?? o.position.y,
    rotationDeg: to.rotationDeg !== undefined ? ((to.rotationDeg % 360) + 360) % 360 : o.rotation_deg,
  };
  if (!insideRoom({ ...next, w: o.size.w, d: o.size.d }, plan.width, plan.depth)) throw new EditError(`"${id}" would stick out of the room there`);
  const dx = next.x - o.position.x, dy = next.y - o.position.y;
  o.position = { ...o.position, x: round(next.x), y: round(next.y) };
  o.rotation_deg = round(next.rotationDeg);
  for (const child of onTop(data, id)) child.position = { ...child.position, x: round(child.position.x + dx), y: round(child.position.y + dy) };
  data.edits++;
  return overlapWarnings(data, o);
}

/** Take a piece out (and whatever stands on it). */
export function removeObject(data: LayoutData, id: string): string[] {
  const o = data.objects.find((x) => x.id === id);
  if (!o || !isWallType(o.type)) movable(data, id); // wall pieces (pictures, mirrors, shelves) can always come down
  const gone = new Set([id, ...onTop(data, id).map((c) => c.id)]);
  data.objects = data.objects.filter((o) => !gone.has(o.id));
  data.edits++;
  return [...gone];
}

const round = (v: number) => Math.round(v * 1000) / 1000;
