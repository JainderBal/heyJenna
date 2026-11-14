import { PaletteResult } from './palette';

/** What reading the moodboard adds on top of the colours. */
export interface Vibe {
  name: string;
  vibe: string[];      // short mood tags: "70s", "warm", "playful"
  keywords: string[];  // words that find matching products in shops: "mid century", "teak", "boucle"
  shapeFamily: 'retro' | 'modern' | 'garden';
  materials: { wood?: string; metal?: string; fabric?: string };
  stylingDensity: 'sparse' | 'balanced' | 'layered';
  source: 'claude' | 'rules';
}

export interface VibeReader {
  read(images: Buffer[], palette: PaletteResult): Promise<Vibe>;
}

export const VIBE_READER = Symbol('VIBE_READER');
