import { FloorPlan } from '@hey-jenna/contracts';

/** Checks the zod schema can't express: openings must fit on their wall and not overlap. */
export function floorPlanProblems(plan: FloorPlan): string[] {
  const problems: string[] = [];
  const wallLength = (w: string) => (w === 'back' || w === 'front' ? plan.width : plan.depth);
  const openings = [
    ...plan.windows.map((o) => ({ ...o, kind: 'window' })),
    ...plan.doors.map((o) => ({ ...o, kind: 'door' })),
  ];
  const ids = new Set<string>();
  for (const o of openings) {
    if (ids.has(o.id)) problems.push(`duplicate opening id "${o.id}"`);
    ids.add(o.id);
    const start = o.position - o.width / 2;
    const end = o.position + o.width / 2;
    if (start < 0 || end > wallLength(o.wall)) problems.push(`${o.kind} "${o.id}" does not fit on the ${o.wall} wall`);
  }
  for (const w of plan.windows) {
    if (w.head <= w.sill) problems.push(`window "${w.id}": head must be above the sill`);
    if (w.head > plan.wallHeight) problems.push(`window "${w.id}" is taller than the wall`);
  }
  for (let i = 0; i < openings.length; i++)
    for (let j = i + 1; j < openings.length; j++) {
      const a = openings[i], b = openings[j];
      if (a.wall !== b.wall) continue;
      if (Math.abs(a.position - b.position) < (a.width + b.width) / 2)
        problems.push(`"${a.id}" and "${b.id}" overlap on the ${a.wall} wall`);
    }
  return problems;
}
