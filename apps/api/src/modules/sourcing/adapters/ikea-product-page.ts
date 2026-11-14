import { Size } from '@hey-jenna/contracts';

/**
 * Reads the "Measurements" section of an IKEA product page:
 *   "Width 240 cm (94 1/2 ") Depth 95 cm (…) Height 71 cm (…)"
 * Width/Length → w, Depth/Width → d, Height → h, Diameter fills both w and d (round tables, rugs).
 */
export function parseIkeaMeasurements(html: string): Size | null {
  const start = html.indexOf('pipf-measurements-tab__layout');
  if (start < 0) return null;
  const text = html.slice(start, start + 8000).replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
  const cm = (label: string) => {
    const m = new RegExp(`(?:^|\\s)${label}:?\\s+(\\d+(?:[.,]\\d+)?)\\s*cm`, 'i').exec(text);
    return m ? Number(m[1].replace(',', '.')) / 100 : undefined;
  };
  const width = cm('Width'), length = cm('Length'), depth = cm('Depth'), height = cm('Height'), diameter = cm('Diameter');
  const w = length ?? width ?? diameter;
  const d = length ? (width ?? depth) : (depth ?? diameter);
  const h = height ?? (w && d ? 0.02 : undefined); // rugs have no height
  if (!w || !d || !h) return null;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { w: r(Math.max(w, d)), d: r(Math.min(w, d)), h: r(h) };
}
