import { NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { MoodboardImagesResponse } from '@hey-jenna/contracts';
import { isOn } from './style.controller';
import { StyleService } from './style.service';

const ROOM = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const keyOf = (id: string) => `moodboards/${ROOM}/${id}.img`;

describe('StyleService moodboard images', () => {
  const solid = (rgb: [number, number, number]) =>
    sharp({ create: { width: 16, height: 16, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();

  let saved = 0;
  const make = (imageKeys: string[], imageMeta: unknown = {}) => {
    const row = { id: 's', roomId: ROOM, imageKeys, imageMeta, profile: {}, createdAt: new Date(), updatedAt: new Date() };
    const repo = {
      findByRoom: jest.fn().mockResolvedValue(row),
      delete: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockImplementation(async (_r, k, p, m) => ({ ...row, imageKeys: k, profile: p, imageMeta: m })),
    };
    const storage = { load: jest.fn(), tryLoad: jest.fn(), save: jest.fn().mockImplementation(async (dir: string) => `${dir}/fresh-${++saved}.img`) };
    const rooms = { getOwnedRoom: jest.fn().mockResolvedValue({}) };
    const reader = { read: jest.fn().mockResolvedValue({ name: 'n', source: 'rules', keywords: ['teak'], vibe: ['warm'], shapeFamily: 'retro', materials: {}, stylingDensity: 'balanced' }) };
    const svc = new StyleService(repo as never, rooms as never, storage as never, reader as never);
    return { svc, repo, storage, rooms };
  };

  const pinMeta = { [keyOf(B)]: { url: 'https://i.pinimg.com/736x/b.jpg', link: 'https://shop.example/b' } };

  it('lists uploads behind the API route and pins with their pinimg url and link', async () => {
    const { svc, rooms } = make([keyOf(A), keyOf(B)], pinMeta);
    const r = await svc.listImages(ROOM, 'me');
    expect(rooms.getOwnedRoom).toHaveBeenCalledWith(ROOM, 'me');
    expect(r.images).toEqual([
      { id: A, url: `/rooms/${ROOM}/moodboard/images/${A}`, source: 'upload' },
      { id: B, url: 'https://i.pinimg.com/736x/b.jpg', source: 'pin', link: 'https://shop.example/b' },
    ]);
    expect(MoodboardImagesResponse.safeParse(r).success).toBe(true);
  });

  it('treats rows from before pin metadata existed as uploads, and a room without a moodboard as empty', async () => {
    const { svc, repo } = make([keyOf(A)], null);
    expect((await svc.listImages(ROOM, 'me')).images[0].source).toBe('upload');
    repo.findByRoom.mockResolvedValue(null);
    expect(await svc.listImages(ROOM, 'me')).toEqual({ images: [] });
  });

  it('serves the stored file with the content type read from its bytes', async () => {
    const { svc, storage } = make([keyOf(A)]);
    storage.tryLoad.mockResolvedValue(await solid([10, 20, 30]));
    const f = await svc.imageFile(ROOM, 'me', A);
    expect(f.contentType).toBe('image/png');
    expect(storage.tryLoad).toHaveBeenCalledWith(keyOf(A));
  });

  it('answers 404 for an image that is not in this room, or whose file is gone', async () => {
    const { svc, storage } = make([keyOf(A)]);
    await expect(svc.imageFile(ROOM, 'me', B)).rejects.toBeInstanceOf(NotFoundException);
    storage.tryLoad.mockResolvedValue(null);
    await expect(svc.imageFile(ROOM, 'me', A)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('checks ownership before anything else', async () => {
    const { svc, rooms, repo } = make([keyOf(A)]);
    rooms.getOwnedRoom.mockRejectedValue(new NotFoundException());
    await expect(svc.listImages(ROOM, 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.imageFile(ROOM, 'x', A)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.removeImage(ROOM, 'x', A)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findByRoom).not.toHaveBeenCalled();
  });

  it('removes one image, drops its pin entry and re-derives the style from the rest', async () => {
    const { svc, repo, storage, } = make([keyOf(A), keyOf(B)], pinMeta);
    storage.load.mockResolvedValue(await solid([200, 180, 150]));
    const r = await svc.removeImage(ROOM, 'me', B);
    expect(storage.load).toHaveBeenCalledTimes(1);
    expect(storage.load).toHaveBeenCalledWith(keyOf(A));
    const [, keys, profile, meta] = repo.upsert.mock.calls[0];
    expect(keys).toEqual([keyOf(A)]);
    expect(meta).toEqual({});
    expect(profile.palette.dominant.length).toBeGreaterThan(0);
    expect(r.images.map((i) => i.id)).toEqual([A]);
  });

  it('keeps the other pins when removing an upload', async () => {
    const { svc, repo, storage } = make([keyOf(A), keyOf(B)], pinMeta);
    storage.load.mockResolvedValue(await solid([200, 180, 150]));
    await svc.removeImage(ROOM, 'me', A);
    expect(repo.upsert.mock.calls[0][3]).toEqual(pinMeta);
  });

  it('clears the style, as for a fresh room, when the last image goes', async () => {
    const { svc, repo } = make([keyOf(A)]);
    expect(await svc.removeImage(ROOM, 'me', A)).toEqual({ images: [] });
    expect(repo.delete).toHaveBeenCalledWith(ROOM);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('answers 404 when deleting an image the room does not have', async () => {
    const { svc, repo } = make([keyOf(A)]);
    await expect(svc.removeImage(ROOM, 'me', B)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  describe('upload with ?append', () => {
    const file = async (rgb: [number, number, number]) => ({ buffer: await solid(rgb), mimetype: 'image/png' });

    it('adds the new uploads after the kept images and pins, and re-derives the style from all of them', async () => {
      const { svc, repo, storage } = make([keyOf(A), keyOf(B)], pinMeta);
      storage.load.mockResolvedValue(await solid([200, 180, 150]));
      const r = await svc.analyseMoodboard(ROOM, 'me', [await file([40, 60, 90])], [], { append: true });
      expect(storage.load.mock.calls.map((c) => c[0])).toEqual([keyOf(A), keyOf(B)]);
      expect(storage.save).toHaveBeenCalledTimes(1);
      const [, keys, profile, meta] = repo.upsert.mock.calls[0];
      expect(keys).toHaveLength(3);
      expect(keys.slice(0, 2)).toEqual([keyOf(A), keyOf(B)]);
      expect(meta).toEqual(pinMeta);
      expect(profile.derivedDials).toEqual(profile.dials);
      expect(profile.measuredDials).toContain('palette_temperature');
      expect(r.imageCount).toBe(3);
    });

    it('works on a room with no moodboard yet', async () => {
      const { svc, repo } = make([]);
      repo.findByRoom.mockResolvedValue(null);
      await svc.analyseMoodboard(ROOM, 'me', [await file([40, 60, 90])], [], { append: true });
      expect(repo.upsert.mock.calls[0][1]).toHaveLength(1);
    });

    it('refuses to go over 8 images in all, before storing anything', async () => {
      const keys = [A, B, A, B, A, B, A].map((id, i) => keyOf(id).replace('.img', `${i}.img`));
      const { svc, repo, storage } = make(keys);
      const two = [await file([1, 2, 3]), await file([4, 5, 6])];
      await expect(svc.analyseMoodboard(ROOM, 'me', two, [], { append: true })).rejects.toThrow(/7 already/);
      expect(storage.save).not.toHaveBeenCalled();
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('still replaces the board without it', async () => {
      const { svc, repo, storage } = make([keyOf(A), keyOf(B)], pinMeta);
      await svc.analyseMoodboard(ROOM, 'me', [await file([40, 60, 90])], []);
      expect(repo.findByRoom).not.toHaveBeenCalled();
      expect(storage.load).not.toHaveBeenCalled();
      const [, keys, , meta] = repo.upsert.mock.calls[0];
      expect(keys).toHaveLength(1);
      expect(keys[0]).not.toBe(keyOf(A));
      expect(meta).toEqual({});
    });

    it('reads the flag as 1 or true only', () => {
      expect([isOn('1'), isOn('true'), isOn(undefined), isOn('0'), isOn('')]).toEqual([true, true, false, false, false]);
    });
  });

  describe('PATCH style', () => {
    it('keeps what the moodboard derived, so the dials can be reset, and marks the source as edited once', async () => {
      const { svc, repo, storage } = make([]);
      repo.findByRoom.mockResolvedValue(null);
      storage.load.mockResolvedValue(undefined);
      await svc.analyseMoodboard(ROOM, 'me', [{ buffer: await solid([200, 160, 120]), mimetype: 'image/png' }], []);
      const row = await repo.upsert.mock.results[0].value;
      let stored = row.profile;
      const updateProfile = jest.fn().mockImplementation(async (_r, p) => ({ ...row, profile: (stored = p) }));
      Object.assign(repo, { updateProfile });
      repo.findByRoom.mockImplementation(async () => ({ ...row, profile: stored }));
      await svc.update(ROOM, 'me', { dials: { curvature: 0.9 } });
      const r = await svc.update(ROOM, 'me', { dials: { rug_type: 'jute_sisal' } });
      expect(r.profile.dials.curvature).toBe(0.9);
      expect(r.profile.dials.rug_type).toBe('jute_sisal');
      expect(r.profile.derivedDials).toEqual(row.profile.derivedDials);
      expect(r.profile.measuredDials).toEqual(row.profile.measuredDials);
      expect(r.profile.source.match(/edited/g)).toHaveLength(1);
    });
  });
});
