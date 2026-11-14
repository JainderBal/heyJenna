import { FloorPlan, FurnitureType, Size, StyleProfile } from '@hey-jenna/contracts';
import { hexToRgb, labDistance, rgbToLab } from '../../style/analysis/colour';
import { COLOUR_WORDS, colourWordLab } from '../../style/analysis/colour-names';
import { PRICE_HEADROOM } from './budget';
import { dialWords, ORNATE, shapeWords } from './dial-words';

export interface ScoreDetail {
  style: number;  // style words found in the listing
  colour: number; // how close the listing's colour words are to the palette
  fit: number;    // does it fit the room
  price: number;  // has a price we can show
  total: number;
  matchedWords: string[];
}

const WEIGHTS = { style: 0.3, colour: 0.4, fit: 0.2, price: 0.1 };
/** Pieces that carry the 10 % accent colour. */
const SMALL_PIECES: FurnitureType[] = ['side_table', 'floor_lamp', 'table_lamp', 'ceiling_light', 'pouf', 'art', 'desk_chair', 'mirror', 'wall_shelf'];

/** Colour words a seller used, e.g. "rust velvet sofa" → ["rust"]. */
export function coloursIn(text: string): string[] {
  const t = text.toLowerCase();
  return COLOUR_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(t));
}

/**
 * Price term. With no slot target, having a price to show is enough.
 * With a target, at or under it scores 1, falling to 0 at the search ceiling. A missing price stays uncertain.
 */
export function priceFit(price: number | null, target?: number): number {
  if (target == null) return price != null ? 1 : 0.4;
  if (price == null) return 0.35;
  if (!(target > 0)) return price <= 0 ? 1 : 0;
  if (price <= target) return 1;
  const span = target * (PRICE_HEADROOM - 1);
  return Math.max(0, 1 - (price - target) / span);
}

/** How well one listing suits this room and moodboard, 0..1. */
export function scoreListing(
  input: { type: FurnitureType; text: string; size: Size; sizeEstimated: boolean; price: number | null; colourHexes?: string[]; priceTarget?: number },
  style: StyleProfile,
  plan: FloorPlan,
): ScoreDetail {
  const text = input.text.toLowerCase();

  // style: count keyword/vibe phrases that appear (each word of a phrase must appear)
  const phrases = [...new Set([...style.keywords, ...style.vibe].map((p) => p.toLowerCase()))];
  const matchedWords = phrases.filter((p) => p.split(/\s+/).every((w) => text.includes(w)));
  // dial words (fabric, rug type, wood tone, fixture…) count half a style word each
  const dialMatched = dialWords(input.type, style.dials).filter((w) => !phrases.includes(w) && text.includes(w));
  matchedWords.push(...dialMatched);
  // shape dials (curvature, legs, arms, mass, modularity) are only a tiebreaker: 0.05 each, capped at 0.15
  const shapeMatched = shapeWords(input.type, style.dials).filter((w) => !phrases.includes(w) && !dialMatched.includes(w) && text.includes(w));
  matchedWords.push(...shapeMatched);
  let styleScore = (matchedWords.length - dialMatched.length - shapeMatched.length + dialMatched.length * 0.5) / 2
    + Math.min(0.15, shapeMatched.length * 0.05);
  // ornament dial: plain boards push carved/tufted/fringed pieces down, ornate boards pull them up
  if (style.dials && ORNATE.test(text)) styleScore += style.dials.ornament < 0.3 ? -0.25 : style.dials.ornament > 0.6 ? 0.25 : 0;
  styleScore = Math.max(0, Math.min(1, styleScore));

  // colour: how close the product's colour is to the board colours its ROLE should wear
  // (big pieces → main colours, small pieces → accents; 60/30/10). Exact colours when the shop gives them.
  const roleHexes = SMALL_PIECES.includes(input.type)
    ? [...style.palette.accent, ...style.palette.secondary]
    : [...style.palette.secondary, ...style.palette.dominant];
  const palette = roleHexes.map((h) => rgbToLab(hexToRgb(h)));
  const productLabs = input.colourHexes?.length
    ? input.colourHexes.map((h) => rgbToLab(hexToRgb(h)))
    : coloursIn(text).map((w) => colourWordLab(w)!);
  let colourScore = 0.5; // unknown colour: neutral
  if (input.type === 'plant') colourScore = 0.7;
  else if (productLabs.length) {
    const best = Math.min(...productLabs.flatMap((c) => palette.map((p) => labDistance(c, p))));
    colourScore = Math.max(0, 1 - best / 45);
  }

  // fit: big pieces must leave room to walk; flat things only need to fit the floor
  const longest = Math.max(plan.width, plan.depth);
  let fit = input.size.w <= longest * 0.6 && input.size.d <= Math.min(plan.width, plan.depth) * 0.5 ? 1 : 0;
  if (input.type === 'rug') fit = input.size.w <= longest - 0.6 && input.size.d <= Math.min(plan.width, plan.depth) - 0.6 ? 1 : 0;
  if (fit && input.sizeEstimated) fit = 0.6;

  const priceScore = priceFit(input.price, input.priceTarget);
  const total = WEIGHTS.style * styleScore + WEIGHTS.colour * colourScore + WEIGHTS.fit * fit + WEIGHTS.price * priceScore;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { style: r(styleScore), colour: r(colourScore), fit: r(fit), price: r(priceScore), total: r(total), matchedWords };
}
