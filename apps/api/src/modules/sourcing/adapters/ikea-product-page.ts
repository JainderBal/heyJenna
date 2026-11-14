import { Size } from '@hey-jenna/contracts';

/**
 * Reads the "Measurements" section of an IKEA product page:
 *   "Width 240 cm (94 1/2 ") Depth 95 cm (…) Height 71 cm (…)"
 * Width/Length → w, Depth/Width → d, Height → h, Diameter fills both w and d (round tables, rugs).
 */
export function parseIkeaMeasurements(html: string): Size | null {
  const start = html.indexOf('pipf-measurements-tab__layout');
  if (start < 0) return null;
  // each label sits in its own element: split on tags so "Armrest width 10 cm" can't pass for "Width"
  const chunks = html.slice(start, start + 8000).replace(/&quot;/g, '"').split(/<[^>]+>/).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const pairs: [string, number][] = [];
  for (let i = 0; i < chunks.length; i++) {
    // "Width 240 cm (…) Height 71 cm" in one piece of text: every label/value pair in it
    const inline = [...chunks[i].matchAll(/(?:^|[\s)])([A-Za-z][A-Za-z ]*?):?\s+(\d+(?:[.,]\d+)?)\s*cm\b/g)];
    const next = /^(\d+(?:[.,]\d+)?)\s*cm\b/.exec(chunks[i + 1] ?? ''); // "<dt>Width</dt><dd>240 cm</dd>"
    if (inline.length) for (const m of inline) pairs.push([m[1].trim().toLowerCase(), Number(m[2].replace(',', '.'))]);
    else if (next && /^[A-Za-z][A-Za-z ]*:?$/.test(chunks[i])) pairs.push([chunks[i].replace(':', '').toLowerCase(), Number(next[1].replace(',', '.'))]);
  }
  const cm = (label: string) => {
    const hit = pairs.find(([l]) => l === label.toLowerCase());
    return hit ? hit[1] / 100 : undefined;
  };
  // sofas often say "Height including back cushions": accept a label that starts with "height"
  const heightLike = pairs.find(([l]) => l.startsWith('height '))?.[1];
  const width = cm('Width'), length = cm('Length'), depth = cm('Depth'), diameter = cm('Diameter');
  const height = cm('Height') ?? (heightLike !== undefined ? heightLike / 100 : undefined);
  const w = length ?? width ?? diameter;
  const d = length ? (width ?? depth) : (depth ?? diameter);
  const h = height ?? (w && d ? 0.02 : undefined); // rugs have no height
  if (!w || !d || !h) return null;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { w: r(Math.max(w, d)), d: r(Math.min(w, d)), h: r(h) };
}
