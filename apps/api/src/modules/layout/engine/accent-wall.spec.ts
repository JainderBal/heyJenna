import { accentWall, accentWallColour, wallsWithAccent } from './accent-wall';
import { nearestColourName } from '../../style/analysis/colour-names';
import { hexToRgb, rgbToLab } from '../../style/analysis/colour';

const plan = {
  width: 6, depth: 4.8, wallHeight: 2.7, floor: 'wood', features: [], doors: [],
  walls: { back: { finish: 'brick' } },
  windows: [{ id: 'w', wall: 'back' as const, position: 3, width: 1.5, sill: 0.8, head: 2.1, view: 'plain' as const }],
};

describe('accent wall', () => {
  it('picks rust from the motel-lounge palette (the look we liked)', () => {
    const hex = accentWallColour({ dominant: ['#492313', '#795434'], secondary: ['#1C1915', '#CAC6AF', '#414432'], accent: ['#B48E51', '#A95323'] });
    expect(nearestColourName(hex)).toBe('rust');
  });
  it('picks cobalt from a blue-and-cream palette, kept mid-tone', () => {
    const hex = accentWallColour({ dominant: ['#EDE6D8'], secondary: ['#1D2C50', '#C9B79C'], accent: ['#2E5BBA'] });
    expect(['blue', 'navy']).toContain(nearestColourName(hex));
    const L = rgbToLab(hexToRgb(hex))[0];
    expect(L).toBeGreaterThanOrEqual(34);
    expect(L).toBeLessThanOrEqual(66);
  });
  it('uses the window wall and keeps its finish', () => {
    expect(accentWall({ ...plan, walls: {} })).toBe('back');
    const style = { palette: { dominant: ['#EDE6D8'], secondary: ['#2F7A45'], accent: ['#2F7A45'] } } as never;
    const walls = wallsWithAccent(plan, style);
    expect(walls.back).toMatchObject({ finish: 'brick', feature: true });
    expect(nearestColourName(walls.back!.colour!)).toBe('green');
  });
});
