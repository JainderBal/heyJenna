import sharp from 'sharp';
import { chroma, Lab, labDistance, RGB, rgbToHex, rgbToLab } from './colour';

export interface PaletteCluster {
  hex: string;
  share: number; // fraction of all sampled pixels
  lab: Lab;
}

export interface PaletteResult {
  dominant: string[];
  secondary: string[];
  accent: string[];
  clusters: PaletteCluster[];
  warmth: number;     // -1 cool … +1 warm
  saturation: number; // 0 … 1
  lightness: number;  // 0 … 1
}

const SAMPLE = 72; // each image is shrunk to about 72×72 before clustering

async function samplePixels(image: Buffer): Promise<RGB[]> {
  const { data, info } = await sharp(image)
    .rotate()
    .resize(SAMPLE, SAMPLE, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px: RGB[] = [];
  for (let i = 0; i < data.length; i += info.channels) px.push([data[i], data[i + 1], data[i + 2]]);
  return px;
}

/** k-means in Lab space. Starts from evenly spaced lightness ranks so results are repeatable. */
function kmeans(points: Lab[], k: number, rounds = 12): { centre: Lab; count: number }[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  let centres: Lab[] = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)]);
  let counts = new Array(k).fill(0);
  for (let r = 0; r < rounds; r++) {
    const sums = centres.map(() => [0, 0, 0]);
    counts = new Array(k).fill(0);
    for (const p of points) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < k; i++) {
        const d = labDistance(p, centres[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      counts[bi]++;
      sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2];
    }
    centres = centres.map((c, i) => (counts[i] ? [sums[i][0] / counts[i], sums[i][1] / counts[i], sums[i][2] / counts[i]] : c));
  }
  return centres.map((centre, i) => ({ centre, count: counts[i] }));
}

/** Mean RGB of the pixels nearest each centre (Lab → hex without an inverse transform). */
function clusterColours(pixels: RGB[], labs: Lab[], centres: Lab[]): RGB[] {
  const sums = centres.map(() => [0, 0, 0, 0]);
  labs.forEach((p, idx) => {
    let bi = 0, bd = Infinity;
    centres.forEach((c, i) => { const d = labDistance(p, c); if (d < bd) { bd = d; bi = i; } });
    const s = sums[bi]; s[0] += pixels[idx][0]; s[1] += pixels[idx][1]; s[2] += pixels[idx][2]; s[3]++;
  });
  return sums.map((s) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : [128, 128, 128]) as RGB);
}

/**
 * Moodboard images → a 60/30/10 palette.
 * dominant = the biggest calm colours, accent = small vivid pops, secondary = the rest.
 */
export async function extractPalette(images: Buffer[], k = 8): Promise<PaletteResult> {
  const pixels = (await Promise.all(images.map(samplePixels))).flat();
  if (!pixels.length) throw new Error('No pixels to analyse');
  const labs = pixels.map(rgbToLab);
  const raw = kmeans(labs, Math.min(k, pixels.length));
  const rgbs = clusterColours(pixels, labs, raw.map((r) => r.centre));
  const total = pixels.length;

  // Merge near-duplicate clusters (ΔE < 8) so the palette has distinct colours
  const clusters: PaletteCluster[] = [];
  raw.forEach((r, i) => {
    if (!r.count) return;
    const same = clusters.find((c) => labDistance(c.lab, r.centre) < 8);
    if (same) { same.share += r.count / total; return; }
    clusters.push({ hex: rgbToHex(rgbs[i]), share: r.count / total, lab: r.centre });
  });
  clusters.sort((a, b) => b.share - a.share);

  const vivid = (c: PaletteCluster) => chroma(c.lab) > 35;
  const accent = clusters.filter((c) => vivid(c) && c.share < 0.15).slice(0, 3);
  const rest = clusters.filter((c) => !accent.includes(c));
  const dominant = rest.slice(0, 2);
  const secondary = rest.slice(2, 5);
  const fill = (list: PaletteCluster[], from: PaletteCluster[]) => (list.length ? list : from.slice(0, 1));

  const mean = (f: (c: PaletteCluster) => number) => clusters.reduce((s, c) => s + f(c) * c.share, 0);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  return {
    dominant: dominant.map((c) => c.hex),
    secondary: fill(secondary, rest.slice(1).length ? rest.slice(1) : clusters).map((c) => c.hex),
    accent: fill(accent, [...clusters].sort((a, b) => chroma(b.lab) - chroma(a.lab))).map((c) => c.hex),
    clusters: clusters.map((c) => ({ ...c, share: Math.round(c.share * 1000) / 1000 })),
    // warm colours sit at +a (red) / +b (yellow); cool at −b (blue)
    warmth: Math.round(clamp(mean((c) => (c.lab[1] * 0.4 + c.lab[2]) / 30), -1, 1) * 100) / 100,
    saturation: Math.round(clamp(mean((c) => chroma(c.lab)) / 60, 0, 1) * 100) / 100,
    lightness: Math.round(clamp(mean((c) => c.lab[0]) / 100, 0, 1) * 100) / 100,
  };
}
