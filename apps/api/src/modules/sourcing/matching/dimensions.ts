import { FurnitureType, Size } from '@hey-jenna/contracts';

/** Typical sizes (metres) used when a listing doesn't say. Marked as estimated. */
export const TYPICAL: Record<FurnitureType, Size> = {
  sofa: { w: 2.1, d: 0.92, h: 0.82 }, armchair: { w: 0.8, d: 0.82, h: 0.85 },
  coffee_table: { w: 1.1, d: 0.6, h: 0.42 }, side_table: { w: 0.45, d: 0.45, h: 0.55 },
  shelf: { w: 0.8, d: 0.35, h: 1.8 }, desk: { w: 1.2, d: 0.6, h: 0.75 },
  desk_chair: { w: 0.55, d: 0.55, h: 0.95 }, sideboard: { w: 1.5, d: 0.45, h: 0.75 },
  pouf: { w: 0.5, d: 0.5, h: 0.42 }, cat_tree: { w: 0.5, d: 0.5, h: 1.2 },
  rug: { w: 2.4, d: 1.7, h: 0.02 }, floor_lamp: { w: 0.35, d: 0.35, h: 1.6 },
  table_lamp: { w: 0.25, d: 0.25, h: 0.45 }, ceiling_light: { w: 0.45, d: 0.45, h: 0.35 },
  plant: { w: 0.45, d: 0.45, h: 1.1 }, art: { w: 0.7, d: 0.03, h: 0.9 },
  mirror: { w: 0.6, d: 0.04, h: 0.8 }, wall_shelf: { w: 0.8, d: 0.2, h: 0.15 },
};

/** Rough limits per type so a misread number ("2000 x 3 x 1") is thrown away. */
const MAX_W: Partial<Record<FurnitureType, number>> = { rug: 5, sofa: 4, sideboard: 3, shelf: 3 };

const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT = '\\s*(cm|mm|m|in|inch|inches|"|”|\'\')?';
const TAG = '\\s*(?:[WDHL]\\b)?'; // "84\"W x 36\"D"
const TRIPLE = new RegExp(`${NUM}${UNIT}${TAG}\\s*[x×X*]\\s*${NUM}${UNIT}${TAG}\\s*[x×X*]\\s*${NUM}${UNIT}`);
const LABEL = (l: string) => new RegExp(`\\b(?:${l})\\s*[:=]?\\s*${NUM}${UNIT}`, 'i');

function toMetres(v: number, unit: string | undefined, guess: 'cm' | 'in'): number {
  const u = (unit ?? guess).toLowerCase();
  if (u === 'mm') return v / 1000;
  if (u === 'cm') return v / 100;
  if (u === 'm') return v;
  return v * 0.0254; // inches
}

/** Unitless numbers: big ones are almost certainly cm, small ones inches (common on eBay / Kijiji). */
const guessUnit = (nums: number[]): 'cm' | 'in' => (Math.max(...nums) > 130 ? 'cm' : 'in');

/** Reads "84"W x 36"D x 32"H", "200 x 90 x 80 cm" or "W 200 cm, D 90 cm, H 80 cm" from listing text. */
export function parseSize(text: string, type: FurnitureType): Size | null {
  let w: number | undefined, d: number | undefined, h: number | undefined;
  const t = TRIPLE.exec(text);
  if (t) {
    const nums = [Number(t[1]), Number(t[3]), Number(t[5])];
    const unit = t[2] ?? t[4] ?? t[6];
    const guess = guessUnit(nums);
    [w, d, h] = nums.map((n) => toMetres(n, unit, guess));
  } else {
    const grab = (label: string) => {
      const m = LABEL(label).exec(text);
      return m ? { v: Number(m[1]), u: m[2] } : undefined;
    };
    const W = grab('W|Width|L|Length'), D = grab('D|Depth'), H = grab('H|Height');
    if (!W || !(D || H)) return null;
    const guess = guessUnit([W.v, D?.v ?? 0, H?.v ?? 0]);
    w = toMetres(W.v, W.u, guess);
    d = D ? toMetres(D.v, D.u ?? W.u, guess) : TYPICAL[type].d;
    h = H ? toMetres(H.v, H.u ?? W.u, guess) : TYPICAL[type].h;
  }
  if (w && d && d > w && type !== 'shelf') [w, d] = [d, w];
  const ok = (v: number | undefined) => v !== undefined && v > 0.05 && v <= (MAX_W[type] ?? 3);
  if (!ok(w) || !ok(d) || !ok(h)) return null;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { w: r(w!), d: r(d!), h: r(h!) };
}

/** Rugs are usually "160x230 cm" (two numbers). */
export function parseFlatSize(text: string, type: 'rug' | 'art' | 'mirror'): Size | null {
  const m = new RegExp(`${NUM}${UNIT}\\s*[x×X*]\\s*${NUM}${UNIT}`).exec(text);
  if (!m) return null;
  const nums = [Number(m[1]), Number(m[3])];
  const guess = type === 'rug' && Math.max(...nums) < 15 ? 'in' : guessUnit(nums);
  // rugs listed in feet ("5x8") are common in North America
  const toM = (n: number, u?: string) => (type === 'rug' && !u && Math.max(...nums) < 15 ? n * 0.3048 : toMetres(n, u, guess));
  const a = toM(nums[0], m[2] ?? m[4]), b = toM(nums[1], m[4] ?? m[2]);
  const [w, d] = a >= b ? [a, b] : [b, a];
  if (w <= 0.1 || w > 6) return null;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return type === 'rug' ? { w: r(w), d: r(d), h: 0.02 } : { w: r(d), d: 0.03, h: r(w) };
}

/** Is this a believable size for this kind of furniture? (Each side within ⅓× … 3× of typical.) */
export function plausibleSize(type: FurnitureType, s: Size): boolean {
  const t = TYPICAL[type];
  const ok = (v: number, ref: number) => v >= ref / 3 && v <= ref * 3;
  return ok(s.w, t.w) && ok(s.d, t.d) && (type === 'rug' || type === 'art' || ok(s.h, t.h));
}

export function sizeFor(text: string, type: FurnitureType): { size: Size; estimated: boolean } {
  const found = type === 'rug' || type === 'art' || type === 'mirror' ? parseFlatSize(text, type) ?? parseSize(text, type) : parseSize(text, type);
  return found ? { size: found, estimated: false } : { size: TYPICAL[type], estimated: true };
}
