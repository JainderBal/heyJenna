import { FloorPlan, FurnitureType, Size, StyleProfile } from '@hey-jenna/contracts';
import { hexToRgb, labDistance, rgbToLab } from '../../style/analysis/colour';
import { COLOUR_WORDS, colourWordLab } from '../../style/analysis/colour-names';

export interface ScoreDetail {
  style: number;  // style words found in the listing
  colour: number; // how close the listing's colour words are to the palette
  fit: number;    // does it fit the room
  price: number;  // has a price we can show
  total: number;
  matchedWords: string[];
}

const WEIGHTS = { style: 0.4, colour: 0.3, fit: 0.2, price: 0.1 };

/** Colour words a seller used, e.g. "rust velvet sofa" → ["rust"]. */
export function coloursIn(text: string): string[] {
  const t = text.toLowerCase();
  return COLOUR_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(t));
}

/** How well one listing suits this room and moodboard, 0..1. */
export function scoreListing(
  input: { type: FurnitureType; text: string; size: Size; sizeEstimated: boolean; price: number | null },
  style: StyleProfile,
  plan: FloorPlan,
): ScoreDetail {
  const text = input.text.toLowerCase();

  // style: count keyword/vibe phrases that appear (each word of a phrase must appear)
  const phrases = [...new Set([...style.keywords, ...style.vibe].map((p) => p.toLowerCase()))];
  const matchedWords = phrases.filter((p) => p.split(/\s+/).every((w) => text.includes(w)));
  const styleScore = Math.min(1, matchedWords.length / 2);

  // colour: nearest palette colour to any colour word in the title (no colour words → neutral)
  const palette = [...style.palette.dominant, ...style.palette.secondary, ...style.palette.accent].map((h) => rgbToLab(hexToRgb(h)));
  const words = coloursIn(text);
  let colourScore = 0.5;
  if (words.length) {
    const best = Math.min(...words.flatMap((w) => palette.map((p) => labDistance(colourWordLab(w)!, p))));
    colourScore = Math.max(0, 1 - best / 50);
  }

  // fit: big pieces must leave room to walk; flat things only need to fit the floor
  const longest = Math.max(plan.width, plan.depth);
  let fit = input.size.w <= longest * 0.6 && input.size.d <= Math.min(plan.width, plan.depth) * 0.5 ? 1 : 0;
  if (input.type === 'rug') fit = input.size.w <= longest - 0.6 && input.size.d <= Math.min(plan.width, plan.depth) - 0.6 ? 1 : 0;
  if (fit && input.sizeEstimated) fit = 0.6;

  const priceScore = input.price != null ? 1 : 0.4;
  const total = WEIGHTS.style * styleScore + WEIGHTS.colour * colourScore + WEIGHTS.fit * fit + WEIGHTS.price * priceScore;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { style: r(styleScore), colour: r(colourScore), fit: r(fit), price: r(priceScore), total: r(total), matchedWords };
}
