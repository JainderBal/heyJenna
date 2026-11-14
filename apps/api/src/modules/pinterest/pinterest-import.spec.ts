import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AppConfig } from '../../common/config/app-config.service';
import { parseBoardUrl } from './board-rss';
import { PinterestService } from './pinterest.service';

const fixture = readFileSync(join(__dirname, 'fixtures', 'board.rss'));
const feedRes = (status: number, body: string | Buffer = '') =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/rss+xml' }),
    body: (async function* () { yield Buffer.from(body); })(),
  }) as unknown as Response;

describe('parseBoardUrl', () => {
  it.each([
    ['https://www.pinterest.com/jenna/warm-living-room/', 'www.pinterest.com'],
    ['https://www.pinterest.ca/jenna/warm-living-room', 'www.pinterest.ca'],
    ['https://pinterest.co.uk/jenna/warm-living-room.rss', 'pinterest.co.uk'],
    ['pinterest.com/jenna/warm-living-room/?utm=x', 'pinterest.com'],
  ])('normalises %s to its .rss feed', (raw, host) => {
    expect(parseBoardUrl(raw)).toEqual({
      boardUrl: `https://${host}/jenna/warm-living-room/`,
      feedUrl: `https://${host}/jenna/warm-living-room.rss`,
    });
  });

  it.each([
    'not a url at all %%',
    'https://example.com/jenna/board/',
    'https://pinterest.com.evil.example/jenna/board/',
    'https://www.pinterest.com/jenna/',
    'https://www.pinterest.com/pin/123456/',
    'https://www.pinterest.com/jenna/board/section/',
    'ftp://www.pinterest.com/jenna/board/',
  ])('answers 400 for %s', (raw) => {
    expect(() => parseBoardUrl(raw)).toThrow(BadRequestException);
  });
});

describe('PinterestService.importBoard', () => {
  const fetchMock = jest.fn();
  const svc = new PinterestService({ get: () => undefined } as unknown as AppConfig); // no token: import must not need one
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('reads the feed, upgrades images to /736x/ and returns the pin shape', async () => {
    fetchMock.mockResolvedValueOnce(feedRes(200, fixture));
    const r = await svc.importBoard('https://www.pinterest.com/jenna/warm-living-room/');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://www.pinterest.com/jenna/warm-living-room.rss');
    expect(r.board).toEqual({ title: 'Warm & Cozy Living Room', url: 'https://www.pinterest.com/jenna/warm-living-room/' });
    expect(r.pins).toEqual([
      { id: '1111111111', title: 'Teak sofa & rug', imageUrl: 'https://i.pinimg.com/736x/aa/bb/cc/aabbcc.jpg', link: 'https://www.pinterest.com/pin/1111111111/' },
      { id: '2222222222', title: null, imageUrl: 'https://i.pinimg.com/736x/dd/ee/ff/ddeeff.jpg', link: 'https://www.pinterest.com/pin/2222222222/' },
    ]);
  });

  it('fetches regional domains from the same domain', async () => {
    fetchMock.mockResolvedValueOnce(feedRes(200, fixture));
    await svc.importBoard('https://www.pinterest.ca/jenna/warm-living-room');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://www.pinterest.ca/jenna/warm-living-room.rss');
  });

  it('answers 404 when the feed is missing', async () => {
    fetchMock.mockResolvedValueOnce(feedRes(404));
    await expect(svc.importBoard('https://www.pinterest.com/jenna/gone/')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 when a private board returns a page instead of a feed', async () => {
    fetchMock.mockResolvedValueOnce(feedRes(200, '<!doctype html><html><body>Log in</body></html>'));
    await expect(svc.importBoard('https://www.pinterest.com/jenna/secret/')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 400 and never fetches for a non-board URL', async () => {
    await expect(svc.importBoard('https://example.com/a/b')).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('produces pins the moodboard endpoints accept (i.pinimg.com, https)', async () => {
    fetchMock.mockResolvedValueOnce(feedRes(200, fixture));
    const { AddPinsRequest } = await import('@hey-jenna/contracts');
    const r = await svc.importBoard('https://www.pinterest.com/jenna/warm-living-room/');
    const parsed = AddPinsRequest.safeParse({ pins: r.pins.map((p) => ({ id: p.id, imageUrl: p.imageUrl, link: p.link ?? undefined })) });
    expect(parsed.success).toBe(true);
    expect(r.pins.every((p) => new URL(p.imageUrl).hostname === 'i.pinimg.com')).toBe(true);
  });
});
