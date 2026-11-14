import { insideRoom, overlaps } from './geometry';

describe('geometry', () => {
  const sofa = { x: 2, y: 1, w: 2, d: 0.9, rotationDeg: 0 };
  it('knows when a piece leaves the room', () => {
    expect(insideRoom(sofa, 5, 4)).toBe(true);
    expect(insideRoom({ ...sofa, x: 0.5 }, 5, 4)).toBe(false);
    // turned 90°, the same sofa is 2 m deep: too close to the back wall at y=0.9
    expect(insideRoom({ ...sofa, y: 0.9, rotationDeg: 90 }, 5, 4)).toBe(false);
  });
  it('detects overlaps, including rotated ones', () => {
    expect(overlaps(sofa, { x: 2, y: 1.6, w: 1, d: 0.6, rotationDeg: 0 })).toBe(true);
    expect(overlaps(sofa, { x: 2, y: 2.2, w: 1, d: 0.6, rotationDeg: 0 })).toBe(false);
    expect(overlaps(sofa, { x: 3.4, y: 1.0, w: 0.6, d: 0.6, rotationDeg: 45 })).toBe(true);
  });
});
