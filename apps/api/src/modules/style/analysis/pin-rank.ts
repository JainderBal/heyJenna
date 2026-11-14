import { PaletteCluster } from './palette';
import { Lab, hexToRgb, labDistance, rgbToLab } from './colour';

/** Mean colour distance (CIELAB, lower = closer) from a pin's colours to the room palette, weighted by how much of the pin each colour covers. */
export function paletteDistance(clusters: PaletteCluster[], roomHex: string[]): number {
  const room: Lab[] = roomHex.map((h) => rgbToLab(hexToRgb(h)));
  const total = clusters.reduce((s, c) => s + c.share, 0) || 1;
  return clusters.reduce((s, c) => s + (c.share / total) * Math.min(...room.map((r) => labDistance(c.lab, r))), 0);
}
