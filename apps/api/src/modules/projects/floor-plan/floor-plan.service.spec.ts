import { BadGatewayException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { floorPlanProblems } from '../../rooms/rooms.validation';
import { StorageService } from '../../../common/storage/storage.service';
import { ProjectsService } from '../projects.service';
import { ClaudeFloorPlanReader, FloorPlanReader, PlanReading } from './floor-plan.reader';
import { FloorPlanService } from './floor-plan.service';
import { normalisePlan, parseLength, parsePrintedSize, toBulkRooms } from './normalise';

const reading = (extra: Partial<PlanReading> = {}): PlanReading => ({
  scaleSource: 'printed',
  notes: [],
  rooms: [
    {
      name: 'Living', kind: 'living', printedSize: null, width: 5, depth: 4, x: 0, y: 0, confidence: 0.9,
      box: { left: 0.1, top: 0.1, right: 0.6, bottom: 0.5 }, openWalls: [],
      windows: [{ wall: 'back', position: 2.5, width: 1.5 }, { wall: 'left', position: 3.9, width: 2 }],
      doors: [{ wall: 'front', position: 1, width: 0.9 }],
    },
    { name: 'Bath', kind: 'bathroom', printedSize: null, width: 1, depth: 45, x: 5, y: 0, confidence: 1.4, box: { left: 0.6, top: 0.1, right: 0.6, bottom: 0.5 }, openWalls: [], windows: [], doors: [] },
  ],
  ...extra,
});

type RawRoom = PlanReading['rooms'][number];
const room = (extra: Partial<RawRoom>): RawRoom => ({
  name: 'Room', kind: 'bedroom', printedSize: null, width: 3, depth: 4, x: 0, y: 0, confidence: 0.8,
  box: { left: 0, top: 0, right: 0.5, bottom: 0.5 }, openWalls: [], windows: [], doors: [], ...extra,
});
const one = (extra: Partial<RawRoom>) => normalisePlan({ scaleSource: 'printed', notes: [], rooms: [room(extra)] });

describe('parseLength / parsePrintedSize', () => {
  it.each([
    [`10'11"`, 3.3274],
    [`12'`, 3.6576],
    [`13' 4"`, 4.064],
    [`10’ 6”`, 3.2004],
    [`8'1 ½"`, 2.4765],
    ['3.2 m', 3.2],
    ['3,2', 3.2],
    ['320 cm', 3.2],
    ['3200', 3.2],
  ])('%s → %f m', (raw, metres) => expect(parseLength(raw)).toBeCloseTo(metres, 3));

  it('reads both sides in printed order, unit after the second number applying to both', () => {
    expect(parsePrintedSize(`10'11" x 13'4"`)).toEqual([expect.closeTo(3.327, 3), expect.closeTo(4.064, 3)]);
    expect(parsePrintedSize('3.2 × 4.1 m')).toEqual([3.2, 4.1]);
    expect(parsePrintedSize('76 PIEDS CARRÉS')).toBeNull();
    expect(parsePrintedSize(null)).toBeNull();
  });
});

describe('normalisePlan', () => {
  it('makes valid floor plans: clamps sizes, nudges openings onto their wall, ids openings', () => {
    const out = normalisePlan(reading());
    expect(out.rooms[0].floorPlan).toMatchObject({
      width: 5, depth: 4,
      windows: [{ id: 'w1', wall: 'back' }, { id: 'w2', wall: 'left', position: 3, width: 2 }],
      doors: [{ id: 'd1', wall: 'front' }],
    });
    expect(out.rooms[1].floorPlan).toMatchObject({ width: 1, depth: 30 });
    expect(out.rooms[1].confidence).toBe(1);
    expect(out.rooms[1].box).toBeNull(); // zero-width box
    expect(out.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/Living: 1 opening\(s\) nudged/), expect.stringMatching(/Bath: size clamped/)]));
  });

  it('says when sizes came from a door', () => {
    expect(normalisePlan(reading({ scaleSource: 'door' })).warnings.join()).toMatch(/0\.9 m/);
  });

  it('uses the printed size, turned to match the drawing, and warns when the reading was off', () => {
    const ok = one({ printedSize: `13'4" x 10'11"`, width: 3.3, depth: 4.1 });
    expect(ok.rooms[0].floorPlan).toMatchObject({ width: 3.33, depth: 4.06 });
    expect(ok.warnings).toEqual([]);
    const off = one({ printedSize: `10' x 13'4"`, width: 2.5, depth: 4 });
    expect(off.rooms[0].floorPlan).toMatchObject({ width: 3.05, depth: 4.06 });
    expect(off.warnings.join()).toMatch(/printed 10' x 13'4"/);
  });

  it('keeps small closets at their real size and furnishes them too', () => {
    const out = one({ name: 'Rangement', kind: 'storage', printedSize: `4'10" x 4'9"`, width: 1.47, depth: 1.45 });
    expect(out.rooms[0]).toMatchObject({ kind: 'storage', furnish: true, floorPlan: { width: 1.47, depth: 1.45 } });
    expect(out.warnings).toEqual([]);
    expect(toBulkRooms(out.rooms)[0]).toMatchObject({ name: 'Rangement', kind: 'storage', furnish: true });
  });

  it('marks open walls and drops openings on them', () => {
    const out = one({ kind: 'dining', openWalls: ['back', 'front'], doors: [{ wall: 'back', position: 1, width: 0.9 }], windows: [{ wall: 'right', position: 2, width: 1.2 }] });
    const plan = out.rooms[0].floorPlan;
    expect(plan.walls).toEqual({ back: { finish: 'paint', open: true }, front: { finish: 'paint', open: true } });
    expect(plan.doors).toEqual([]);
    expect(plan.windows).toHaveLength(1);
    expect(out.rooms[0].furnish).toBe(true); // dining rooms get a table and chairs
  });

  it('fits a door as wide as an odd-centimetre wall without poking past it', () => {
    const out = one({ kind: 'storage', width: 1.47, depth: 1.45, doors: [{ wall: 'front', position: 0.735, width: 1.47 }, { wall: 'left', position: 1.2, width: 0.9 }] });
    const plan = out.rooms[0].floorPlan;
    expect(plan.doors[0]).toMatchObject({ position: 0.74, width: 1.46 });
    expect(floorPlanProblems(plan)).toEqual([]);
  });

  it('stores wide doors (patio sliders, archways) as not swinging', () => {
    const out = one({ width: 3.66, doors: [{ wall: 'front', position: 1.86, width: 2.7 }, { wall: 'left', position: 1, width: 0.85 }] });
    expect(out.rooms[0].floorPlan.doors.map((d) => d.swing)).toEqual(['none', 'in']);
  });

  it('numbers repeated room names', () => {
    const out = normalisePlan({ scaleSource: 'printed', notes: [], rooms: [room({ name: 'Walk-in' }), room({ name: 'Walk-in' }), room({ name: 'walk-in' })] });
    expect(out.rooms.map((r) => r.name)).toEqual(['Walk-in', 'Walk-in 2', 'walk-in 3']);
  });

  it('drops an opening that overlaps another on the same wall (doors first)', () => {
    const out = one({ doors: [{ wall: 'back', position: 1, width: 0.9 }], windows: [{ wall: 'back', position: 1.3, width: 1 }, { wall: 'back', position: 2.4, width: 0.8 }] });
    expect(out.rooms[0].floorPlan.doors).toHaveLength(1);
    expect(out.rooms[0].floorPlan.windows).toEqual([expect.objectContaining({ id: 'w1', position: 2.4 })]);
    expect(out.warnings.join()).toMatch(/1 opening\(s\) overlapped/);
  });
});

describe('normalisePlan on a real plan (2-bedroom condo, French labels, feet and inches)', () => {
  // Claude Opus 5.5's reading of test/fixtures/floor-plans/condo-2br-fr.png, saved so this runs without the API
  const saved = JSON.parse(readFileSync(join(__dirname, '../../../../test/fixtures/floor-plans/condo-2br-fr.reading.json'), 'utf8')) as PlanReading;
  const out = normalisePlan(saved);
  const byName = (name: string) => out.rooms.find((r) => r.name === name)!;
  const ft = (f: number, i = 0) => Math.round((f * 12 + i) * 2.54) / 100;

  it('uses the printed sizes', () => {
    expect(byName('Chambre 1').floorPlan).toMatchObject({ width: ft(10, 11), depth: ft(13, 4) });
    expect(byName('Chambre 2').floorPlan).toMatchObject({ width: ft(10), depth: ft(13, 4) });
    expect(byName('Salon').floorPlan).toMatchObject({ width: ft(12), depth: ft(9, 6) });
    expect(byName('Rangement').floorPlan).toMatchObject({ width: ft(4, 10), depth: ft(4, 9) });
  });

  it('furnishes every room it finds, bedrooms included', () => {
    expect(out.rooms.every((r) => r.furnish)).toBe(true);
    expect(byName('Chambre 1')).toMatchObject({ kind: 'bedroom', furnish: true });
  });

  it('opens the walls between kitchen, dining and living', () => {
    expect(byName('Salle à manger').floorPlan.walls).toMatchObject({ back: { open: true }, front: { open: true } });
    expect(byName('Salon').floorPlan.walls).toMatchObject({ back: { open: true } });
    expect(byName('Cuisine').floorPlan.walls).toMatchObject({ front: { open: true } });
  });

  it('gives every room a plan the bulk create accepts', () => {
    for (const r of out.rooms) expect([r.name, floorPlanProblems(r.floorPlan)]).toEqual([r.name, []]);
    expect(out.rooms.every((r) => r.box)).toBe(true);
  });
});

describe('normalisePlan on a real plan (2-bedroom apartment drawn sideways, bilingual labels, dimension arrows)', () => {
  // Claude Opus 5.5's reading of test/fixtures/floor-plans/apt-2br-bilingual-rotated.png
  const saved = JSON.parse(readFileSync(join(__dirname, '../../../../test/fixtures/floor-plans/apt-2br-bilingual-rotated.reading.json'), 'utf8')) as PlanReading;
  const out = normalisePlan(saved);
  const find = (prefix: string) => out.rooms.find((r) => r.name.startsWith(prefix))!;
  const ft = (f: number, i = 0) => Math.round((f * 12 + i) * 2.54) / 100;

  it('reads the dimension arrows', () => {
    expect(find('Salon').floorPlan).toMatchObject({ width: ft(15, 10), depth: ft(10, 11) });
    expect(find('Salle à manger').floorPlan).toMatchObject({ width: ft(8, 4), depth: ft(8, 7) });
    expect(find('Balcon').floorPlan).toMatchObject({ width: ft(4), depth: ft(11) });
  });

  it('keeps the 68" patio door as a slider, and the living room open to the dining room', () => {
    expect(find('Salon').floorPlan.doors).toEqual([expect.objectContaining({ width: 1.72, swing: 'none' })]);
    expect(find('Salon').floorPlan.walls).toMatchObject({ left: { open: true } });
    expect(out.rooms.every((r) => r.furnish)).toBe(true);
  });

  it('gives every room a plan the bulk create accepts', () => {
    for (const r of out.rooms) expect([r.name, floorPlanProblems(r.floorPlan)]).toEqual([r.name, []]);
  });
});

describe('FloorPlanService', () => {
  let png: Buffer;
  beforeAll(async () => {
    png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#fff' } }).png().toBuffer();
  });
  const projects = {
    getOwnedProject: jest.fn(async (id: string, owner: string) => {
      if (owner !== 'u1') throw new NotFoundException('Project not found');
      return { id };
    }),
    createRooms: jest.fn(async () => [{ id: 'r1' }]),
  };
  const storage = { save: jest.fn(async () => 'floor-plans/p1/x.img') };
  const reader: FloorPlanReader = { read: jest.fn(async () => reading()) };
  const make = (r: FloorPlanReader | null) =>
    new FloorPlanService(projects as unknown as ProjectsService, storage as unknown as StorageService, r);
  beforeEach(() => jest.clearAllMocks());

  it('returns a preview without creating anything, and stores the image', async () => {
    const res = await make(reader).read('p1', 'u1', { file: png }, false);
    expect(res.rooms).toHaveLength(2);
    expect(res.scaleSource).toBe('printed');
    expect(storage.save).toHaveBeenCalledWith('floor-plans/p1', png, 'img', 'application/octet-stream');
    expect(projects.createRooms).not.toHaveBeenCalled();
  });

  it('creates the rooms through the bulk path with ?create=1', async () => {
    const res = await make(reader).read('p1', 'u1', { file: png }, true);
    expect(res.created).toEqual([{ id: 'r1' }]);
    const [, , dto] = projects.createRooms.mock.calls[0] as unknown as [string, string, { rooms: { name: string }[] }];
    expect(dto.rooms.map((r) => r.name)).toEqual(['Living', 'Bath']);
  });

  it('is 422 without a key, and 404 for someone else’s project', async () => {
    await expect(make(null).read('p1', 'u1', { file: png }, false)).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(make(reader).read('p1', 'u2', { file: png }, false)).rejects.toBeInstanceOf(NotFoundException);
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('rejects a malformed Claude reply', async () => {
    const parse = jest.fn(async () => ({ stop_reason: 'end_turn', parsed_output: { rooms: [{ name: 'Living', width: 'big' }] } }));
    const claude = new ClaudeFloorPlanReader('k', 'claude-opus-5-5', { beta: { messages: { parse } } } as never);
    await expect(make(claude).read('p1', 'u1', { file: png }, true)).rejects.toBeInstanceOf(BadGatewayException);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(projects.createRooms).not.toHaveBeenCalled();
  });

  it('accepts a well-formed Claude reply', async () => {
    const parse = jest.fn(async () => ({ stop_reason: 'end_turn', parsed_output: reading() }));
    const claude = new ClaudeFloorPlanReader('k', 'claude-opus-5-5', { beta: { messages: { parse } } } as never);
    const res = await make(claude).read('p1', 'u1', { file: png }, false);
    expect(res.rooms.map((r) => r.kind)).toEqual(['living', 'bathroom']);
  });
});
