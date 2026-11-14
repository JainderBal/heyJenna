/** Lighten (a > 0) or darken (a < 0) a #rrggbb colour by a fraction. From the prototype. */
export function shade(h: string, a: number): string {
  const n = parseInt(h.slice(1), 16);
  let r = n >> 16;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const f = a < 0 ? 0 : 255;
  const t = Math.abs(a);
  r = Math.round((f - r) * t + r);
  g = Math.round((f - g) * t + g);
  b = Math.round((f - b) * t + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
