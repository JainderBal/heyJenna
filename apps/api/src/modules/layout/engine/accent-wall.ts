import { FloorPlan, StyleProfile, Wall } from '@hey-jenna/contracts';
import { chroma, hexToRgb, Lab, labDistance, RGB, rgbToHex, rgbToLab } from '../../style/analysis/colour';

/** Wall colours look best mid-tone: not near-black, not washed out. */
const L_MIN = 34;
const L_MAX = 66;

/** Nudge a colour lighter/darker (mixing with white or black) until it sits in the mid-tone band. */
function midTone(hex: string): string {
  let rgb = hexToRgb(hex);
  for (let i = 0; i < 20; i++) {
    const L = rgbToLab(rgb)[0];
    if (L >= L_MIN && L <= L_MAX) break;
    const toward: RGB = L < L_MIN ? [255, 255, 255] : [0, 0, 0];
    rgb = rgb.map((c, k) => c + (toward[k] - c) * 0.1) as RGB;
  }
  return rgbToHex(rgb);
}

/**
 * The accent wall's colour, taken from the moodboard: the boldest secondary/accent colour
 * that stands apart from the main wall colour (dominant), brought to a mid tone.
 */
export function accentWallColour(palette: StyleProfile['palette']): string {
  const base: Lab = rgbToLab(hexToRgb(palette.dominant[0]));
  const candidates = [...palette.accent, ...palette.secondary].map((hex) => {
    const lab = rgbToLab(hexToRgb(hex));
    const lightPenalty = lab[0] < 20 || lab[0] > 85 ? 25 : 0;
    const score = chroma(lab) + Math.min(labDistance(lab, base), 40) * 0.5 - lightPenalty;
    return { hex, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  return midTone(candidates[0]?.hex ?? palette.dominant[0]);
}

/** Which wall carries the accent: the one marked as feature, else the wall with the most window, else the back wall. */
export function accentWall(plan: FloorPlan): Wall {
  const marked = (Object.entries(plan.walls) as [Wall, { feature?: boolean }][]).find(([, f]) => f.feature)?.[0];
  if (marked) return marked;
  const glass: Partial<Record<Wall, number>> = {};
  for (const w of plan.windows) glass[w.wall] = (glass[w.wall] ?? 0) + w.width;
  const best = (Object.entries(glass) as [Wall, number][]).sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? 'back';
}

/** Walls for the engine: the accent wall coloured from the moodboard (its finish, e.g. brick, kept). */
export function wallsWithAccent(plan: FloorPlan, style: StyleProfile | null): FloorPlan['walls'] {
  if (!style) return plan.walls;
  const wall = accentWall(plan);
  const current = plan.walls[wall] ?? { finish: 'paint' };
  return { ...plan.walls, [wall]: { ...current, feature: true, colour: accentWallColour(style.palette) } };
}
