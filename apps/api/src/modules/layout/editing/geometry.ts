/** Footprints on the floor plan (metres). rotation_deg turns the piece around its centre. */
export interface Footprint {
  x: number;
  y: number;
  w: number;
  d: number;
  rotationDeg: number;
}

type Pt = [number, number];

export function corners(f: Footprint): Pt[] {
  const r = (f.rotationDeg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as Pt[]).map(([a, b]) => {
    const lx = (a * f.w) / 2, ly = (b * f.d) / 2;
    return [f.x + lx * c - ly * s, f.y + lx * s + ly * c];
  });
}

export function insideRoom(f: Footprint, width: number, depth: number, tol = 0.005): boolean {
  return corners(f).every(([x, y]) => x >= -tol && y >= -tol && x <= width + tol && y <= depth + tol);
}

/** Separating-axis test for two rotated rectangles. */
export function overlaps(a: Footprint, b: Footprint, margin = 0.01): boolean {
  const ca = corners(a), cb = corners(b);
  for (const poly of [ca, cb])
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % 4];
      const axis: Pt = [y1 - y2, x2 - x1];
      const proj = (p: Pt[]) => p.map(([x, y]) => x * axis[0] + y * axis[1]);
      const pa = proj(ca), pb = proj(cb);
      const len = Math.hypot(axis[0], axis[1]);
      if (Math.max(...pa) - margin * len <= Math.min(...pb) || Math.max(...pb) - margin * len <= Math.min(...pa)) return false;
    }
  return true;
}
