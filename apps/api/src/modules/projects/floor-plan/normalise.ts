import { BulkRoomInput, FloorPlan } from '@hey-jenna/contracts';
import { PlanReading } from './floor-plan.reader';

export interface DetectedRoom {
  name: string;
  kind: PlanReading['rooms'][number]['kind'];
  confidence: number;
  position: { x: number; y: number };
  floorPlan: FloorPlan;
}
export interface FloorPlanPreview {
  rooms: DetectedRoom[];
  scaleSource: PlanReading['scaleSource'];
  warnings: string[];
}

const MIN = 1.5;
const MAX = 30;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Claude's reading → valid floorPlan objects: sizes clamped, impossible openings dropped, with warnings. */
export function normalisePlan(reading: PlanReading): FloorPlanPreview {
  const warnings = [...reading.notes];
  if (reading.scaleSource === 'door') warnings.push('No printed dimensions: sizes scaled from a door taken as 0.9 m wide');
  if (reading.scaleSource === 'guess') warnings.push('No dimensions or doors to scale from: sizes are rough guesses');

  const rooms: DetectedRoom[] = [];
  reading.rooms.forEach((raw, i) => {
    const name = raw.name.trim().slice(0, 120) || `Room ${i + 1}`;
    if (!(raw.width > 0) || !(raw.depth > 0)) {
      warnings.push(`${name}: no usable size, skipped`);
      return;
    }
    const width = r2(clamp(raw.width, MIN, MAX));
    const depth = r2(clamp(raw.depth, MIN, MAX));
    if (width !== r2(raw.width) || depth !== r2(raw.depth)) warnings.push(`${name}: size clamped to ${width} × ${depth} m`);

    const along = (wall: string) => (wall === 'back' || wall === 'front' ? width : depth);
    let dropped = 0;
    const keep = <T extends { wall: string; position: number; width: number }>(o: T) => {
      const ok = o.width > 0 && o.width <= along(o.wall) && o.position - o.width / 2 >= -0.01 && o.position + o.width / 2 <= along(o.wall) + 0.01;
      if (!ok) dropped++;
      return ok;
    };
    const windows = raw.windows.filter(keep).map((w, j) => ({ id: `w${j + 1}`, wall: w.wall, position: r2(w.position), width: r2(w.width) }));
    const doors = raw.doors.filter(keep).map((d, j) => ({ id: `d${j + 1}`, wall: d.wall, position: r2(d.position), width: r2(d.width) }));
    if (dropped) warnings.push(`${name}: ${dropped} opening(s) didn't fit the walls and were dropped`);

    rooms.push({
      name,
      kind: raw.kind,
      confidence: r2(clamp(raw.confidence, 0, 1)),
      position: { x: r2(Math.max(0, raw.x)), y: r2(Math.max(0, raw.y)) },
      floorPlan: FloorPlan.parse({ width, depth, windows, doors }),
    });
  });
  return { rooms: rooms.slice(0, 30), scaleSource: reading.scaleSource, warnings };
}

export const toBulkRooms = (rooms: DetectedRoom[]): BulkRoomInput[] =>
  rooms.map((r) => ({ name: r.name, floorPlan: r.floorPlan, needs: [] }));
