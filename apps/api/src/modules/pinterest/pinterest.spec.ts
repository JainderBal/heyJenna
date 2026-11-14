import { NotImplementedException } from '@nestjs/common';
import sharp from 'sharp';
import { AppConfig } from '../../common/config/app-config.service';
import { StyleService } from '../style/style.service';
import { PinterestService } from './pinterest.service';

const config = (env: Record<string, string | undefined>) => ({ get: (k: string) => env[k] }) as unknown as AppConfig;
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

describe('PinterestService', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('answers 501 without a token and never calls Pinterest', async () => {
    await expect(new PinterestService(config({})).boards()).rejects.toBeInstanceOf(NotImplementedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps boards and sends the bearer token', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [{ id: '1', name: 'Loft', description: '', pin_count: 12 }], bookmark: 'b2' }));
    const r = await new PinterestService(config({ PINTEREST_ACCESS_TOKEN: 'tok' })).boards();
    expect(r).toEqual({ items: [{ id: '1', name: 'Loft', description: '', pinCount: 12 }], bookmark: 'b2' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('https://api.pinterest.com/v5/boards');
    expect(init.headers.authorization).toBe('Bearer tok');
  });

  it('maps pins to id, title, image, size, link and skips pins without a still image', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        items: [
          { id: 'p1', title: 'Teak sofa', link: 'https://shop.example/sofa', media: { images: { '600x': { url: 'https://i.pinimg.com/600x/a.jpg', width: 600, height: 800 } } } },
          { id: 'p2', title: '', media: {} },
        ],
      }),
    );
    const r = await new PinterestService(config({ PINTEREST_ACCESS_TOKEN: 'tok' })).pins('9');
    expect(r.items).toEqual([{ id: 'p1', title: 'Teak sofa', imageUrl: 'https://i.pinimg.com/600x/a.jpg', size: { width: 600, height: 800 }, link: 'https://shop.example/sofa' }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/boards/9/pins');
  });
});

describe('StyleService pins', () => {
  const solid = (rgb: [number, number, number]) =>
    sharp({ create: { width: 16, height: 16, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();
  const img = async (buf: Buffer) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png' }), body: (async function* () { yield buf; })() }) as unknown as Response;

  const make = (keys: string[] = []) => {
    const repo = { findByRoom: jest.fn().mockResolvedValue({ imageKeys: keys, profile: {} }), upsert: jest.fn().mockImplementation(async (_r, k, p) => ({ id: 's', roomId: 'r', imageKeys: k, profile: p, createdAt: new Date(), updatedAt: new Date() })) };
    const storage = { save: jest.fn().mockResolvedValue('new-key'), load: jest.fn().mockResolvedValue(Buffer.alloc(0)) };
    const rooms = { getOwnedRoom: jest.fn().mockResolvedValue({}) };
    const reader = { read: jest.fn().mockResolvedValue({ name: 'n', source: 'rules', keywords: ['teak'], vibe: ['warm'], shapeFamily: 'retro', materials: {}, stylingDensity: 'balanced' }) };
    const svc = new StyleService(repo as never, rooms as never, storage as never, reader as never);
    return { svc, repo, storage, rooms };
  };
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('rejects pin images outside i.pinimg.com before fetching anything', async () => {
    const { svc } = make();
    await expect(svc.addPins('r', 'me', [{ id: '1', imageUrl: 'https://evil.example/a.jpg' }])).rejects.toThrow(/i\.pinimg\.com/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses to overflow the 8-image moodboard', async () => {
    const { svc } = make(Array(7).fill('k'));
    await expect(svc.addPins('r', 'me', [1, 2].map((i) => ({ id: `${i}`, imageUrl: 'https://i.pinimg.com/a.jpg' })))).rejects.toThrow(/at most 8/);
  });

  it('ranks candidates by colour distance to the room palette', async () => {
    const { svc } = make();
    jest.spyOn(svc, 'get').mockResolvedValue({ profile: { palette: { dominant: ['#F2E8D5'], secondary: ['#8A5A3B'], accent: ['#C0392B'] } } } as never);
    const cream = await solid([240, 230, 210]);
    const blue = await solid([20, 60, 200]);
    (global.fetch as jest.Mock).mockImplementation(async (u: URL) => (String(u).includes('blue') ? img(blue) : img(cream)));
    // the DNS lookup in safeFetch is real; i.pinimg.com is public
    const r = await svc.rankPins('r', 'me', [
      { id: 'blue', imageUrl: 'https://i.pinimg.com/blue.png' },
      { id: 'cream', imageUrl: 'https://i.pinimg.com/cream.png' },
    ]);
    expect(r.ranked.map((x) => x.pin.id)).toEqual(['cream', 'blue']);
    expect(r.ranked[0].distance).toBeLessThan(r.ranked[1].distance);
  });

  it('adds pins to the existing moodboard and re-derives the style', async () => {
    const { svc, repo, storage } = make(['old1']);
    storage.load.mockResolvedValue(await solid([200, 200, 200]));
    (global.fetch as jest.Mock).mockImplementation(async () => img(await solid([180, 120, 80])));
    await svc.addPins('r', 'me', [{ id: '1', imageUrl: 'https://i.pinimg.com/a.png' }]);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(repo.upsert.mock.calls[0][1]).toEqual(['old1', 'new-key']);
    expect(repo.upsert.mock.calls[0][3]).toEqual({ 'new-key': { url: 'https://i.pinimg.com/a.png' } });
  });
});
