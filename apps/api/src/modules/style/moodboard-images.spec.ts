import { NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { MoodboardImagesResponse } from '@hey-jenna/contracts';
import { StyleService } from './style.service';

const ROOM = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const keyOf = (id: string) => `moodboards/${ROOM}/${id}.img`;

describe('StyleService moodboard images', () => {
  const solid = (rgb: [number, number, number]) =>
    sharp({ create: { width: 16, height: 16, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();

  const make = (imageKeys: string[], imageMeta: unknown = {}) => {
    const row = { id: 's', roomId: ROOM, imageKeys, imageMeta, profile: {}, createdAt: new Date(), updatedAt: new Date() };
    const repo = {
      findByRoom: jest.fn().mockResolvedValue(row),
      delete: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockImplementation(async (_r, k, p, m) => ({ ...row, imageKeys: k, profile: p, imageMeta: m })),
    };
    const storage = { load: jest.fn(), tryLoad: jest.fn() };
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
});
