import { BadGatewayException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { StorageService } from '../../../common/storage/storage.service';
import { ProjectsService } from '../projects.service';
import { ClaudeFloorPlanReader, FloorPlanReader, PlanReading } from './floor-plan.reader';
import { FloorPlanService } from './floor-plan.service';
import { normalisePlan } from './normalise';

const reading = (extra: Partial<PlanReading> = {}): PlanReading => ({
  scaleSource: 'printed',
  notes: [],
  rooms: [
    {
      name: 'Living', kind: 'living', width: 5, depth: 4, x: 0, y: 0, confidence: 0.9,
      windows: [{ wall: 'back', position: 2.5, width: 1.5 }, { wall: 'left', position: 3.9, width: 2 }],
      doors: [{ wall: 'front', position: 1, width: 0.9 }],
    },
    { name: 'Bath', kind: 'bathroom', width: 1, depth: 45, x: 5, y: 0, confidence: 1.4, windows: [], doors: [] },
  ],
  ...extra,
});

describe('normalisePlan', () => {
  it('makes valid floor plans: clamps sizes, drops openings that do not fit, ids openings', () => {
    const out = normalisePlan(reading());
    expect(out.rooms[0].floorPlan).toMatchObject({ width: 5, depth: 4, windows: [{ id: 'w1', wall: 'back' }], doors: [{ id: 'd1', wall: 'front' }] });
    expect(out.rooms[1].floorPlan).toMatchObject({ width: 1.5, depth: 30 });
    expect(out.rooms[1].confidence).toBe(1);
    expect(out.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/Living: 1 opening/), expect.stringMatching(/Bath: size clamped/)]));
  });

  it('says when sizes came from a door', () => {
    expect(normalisePlan(reading({ scaleSource: 'door' })).warnings.join()).toMatch(/0\.9 m/);
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
