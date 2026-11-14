import { hexToRgb, Lab, labDistance, rgbToLab } from './colour';

/**
 * Plain colour words people type into shop searches and sellers put in titles.
 * Each word maps to a reference colour; a palette colour gets the nearest word.
 */
const NAMED: Record<string, string> = {
  white: '#F5F3EE', cream: '#EFE3C8', beige: '#D8C3A0', tan: '#C19A6B', grey: '#8E8E8E',
  charcoal: '#3A3A3A', black: '#151515', brown: '#6B4423', walnut: '#5C3A21', teak: '#A0612B',
  oak: '#C8A165', rust: '#A9461E', terracotta: '#C8643C', orange: '#E2792C', mustard: '#D4A12A',
  yellow: '#EBCB3A', olive: '#6F7139', green: '#2F7A45', sage: '#9CAF88', teal: '#1F7A7A',
  blue: '#2E5BBA', navy: '#1D2C50', 'light blue': '#9EC3E6', pink: '#EE9DB4', blush: '#E8C2BF',
  red: '#C8332B', burgundy: '#6E1F2B', purple: '#6C3C8C', lilac: '#BFA6D6', gold: '#C9A13B',
  chrome: '#C9CCD1',
};
const NAMED_LAB: [string, Lab][] = Object.entries(NAMED).map(([n, h]) => [n, rgbToLab(hexToRgb(h))]);

export const COLOUR_WORDS = Object.keys(NAMED);

export function nearestColourName(hex: string): string {
  const lab = rgbToLab(hexToRgb(hex));
  let best = NAMED_LAB[0];
  for (const entry of NAMED_LAB) if (labDistance(lab, entry[1]) < labDistance(lab, best[1])) best = entry;
  return best[0];
}

export function colourWordLab(word: string): Lab | undefined {
  return NAMED_LAB.find(([n]) => n === word)?.[1];
}
