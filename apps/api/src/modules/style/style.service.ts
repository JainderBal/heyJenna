import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { densityBand, MoodboardImagesResponse, PinRef, StyleProfile } from '@hey-jenna/contracts';
import sharp from 'sharp';
import { safeFetch } from '../../common/http/safe-fetch';
import { StorageService } from '../../common/storage/storage.service';
import { RoomsService } from '../rooms/rooms.service';
import { DENSITY_VALUE, deriveDials } from './analysis/dials';
import { RuleVibeReader } from './analysis/rule-vibe.reader';
import { extractPalette, PaletteResult } from './analysis/palette';
import { paletteDistance } from './analysis/pin-rank';
import { Vibe, VIBE_READER, VibeReader } from './analysis/vibe';
import { StyleResponseDto } from './dto/style-response.dto';
import { UpdateStyleDto } from './dto/update-style.dto';
import { readProfile, toStyleResponse } from './mappers/style.mapper';
import { ImageMeta, StyleRepository } from './style.repository';

export interface MoodboardFile {
  buffer: Buffer;
  mimetype: string;
}

const MAX_IMAGES = 8;
const PIN_HOST = 'i.pinimg.com';

/** Moodboard → style profile. Other modules call getProfile() to search and lay out in this style. */
@Injectable()
export class StyleService {
  private readonly log = new Logger(StyleService.name);
  private readonly fallbackReader = new RuleVibeReader();

  constructor(
    private readonly repo: StyleRepository,
    private readonly rooms: RoomsService,
    private readonly storage: StorageService,
    @Inject(VIBE_READER) private readonly reader: VibeReader,
  ) {}

  async analyseMoodboard(roomId: string, ownerId: string, files: MoodboardFile[], urls: string[]): Promise<StyleResponseDto> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    if (!files.length && !urls.length) throw new BadRequestException('Add at least one image or image link');
    if (files.length + urls.length > MAX_IMAGES) throw new BadRequestException(`At most ${MAX_IMAGES} images`);

    const images = [...files.map((f) => f.buffer), ...(await this.download(urls))];
    return this.build(roomId, images, []);
  }

  /** Adds Pinterest pins to the room's moodboard (kept images + pins), then re-derives style and dials. */
  async addPins(roomId: string, ownerId: string, pins: PinRef[]): Promise<StyleResponseDto> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    const current = await this.repo.findByRoom(roomId);
    const existing = current?.imageKeys ?? [];
    if (existing.length + pins.length > MAX_IMAGES)
      throw new BadRequestException(`A moodboard holds at most ${MAX_IMAGES} images (${existing.length} already); add fewer pins`);
    const fresh = await this.download(pins.map((p) => this.pinUrl(p)));
    const kept = await Promise.all(existing.map((k) => this.storage.load(k)));
    return this.build(roomId, [...kept, ...fresh], existing, pins, readMeta(current?.imageMeta));
  }

  /** The room's stored moodboard images: pins keep their pinimg url and link, uploads point at the streaming route. */
  async listImages(roomId: string, ownerId: string): Promise<MoodboardImagesResponse> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    const style = await this.repo.findByRoom(roomId);
    return { images: style ? toImages(roomId, style.imageKeys, readMeta(style.imageMeta)) : [] };
  }

  /** The bytes of one stored upload (or pinned copy) and its content type. */
  async imageFile(roomId: string, ownerId: string, imageId: string): Promise<{ data: Buffer; contentType: string }> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    const style = await this.repo.findByRoom(roomId);
    const key = style?.imageKeys.find((k) => imageIdOf(k) === imageId);
    const data = key ? await this.storage.tryLoad(key) : null;
    if (!data) throw new NotFoundException('No such moodboard image');
    const format = (await sharp(data).metadata().catch(() => ({ format: undefined }))).format;
    return { data, contentType: (format && MIME[format]) || 'application/octet-stream' };
  }

  /** Removes one image and re-derives style and dials from the rest. With none left the style is cleared, as for a fresh room. */
  async removeImage(roomId: string, ownerId: string, imageId: string): Promise<MoodboardImagesResponse> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    const style = await this.repo.findByRoom(roomId);
    const key = style?.imageKeys.find((k) => imageIdOf(k) === imageId);
    if (!style || !key) throw new NotFoundException('No such moodboard image');
    const keys = style.imageKeys.filter((k) => k !== key);
    if (!keys.length) {
      await this.repo.delete(roomId);
      return { images: [] };
    }
    const meta = readMeta(style.imageMeta);
    delete meta[key];
    const images = await Promise.all(keys.map((k) => this.storage.load(k)));
    const profile = await this.derive(images);
    const saved = await this.repo.upsert(roomId, keys, profile, meta);
    return { images: toImages(roomId, saved.imageKeys, readMeta(saved.imageMeta)) };
  }

  /** Ranks candidate pins by colour distance to the room's palette, closest first. Unreadable pins are listed apart. */
  async rankPins(roomId: string, ownerId: string, pins: PinRef[]) {
    const { profile } = await this.get(roomId, ownerId);
    const roomHex = [...profile.palette.dominant, ...profile.palette.secondary, ...profile.palette.accent];
    const ranked: { pin: PinRef; distance: number }[] = [];
    const unreadable: { id: string; reason: string }[] = [];
    await Promise.all(
      pins.map(async (pin) => {
        try {
          const [img] = await this.download([this.pinUrl(pin)]);
          const { clusters } = await extractPalette([img], 4);
          ranked.push({ pin, distance: Math.round(paletteDistance(clusters, roomHex) * 10) / 10 });
        } catch (e) {
          unreadable.push({ id: pin.id, reason: (e as Error).message });
        }
      }),
    );
    ranked.sort((a, b) => a.distance - b.distance);
    return { ranked, unreadable };
  }

  private pinUrl(pin: PinRef): string {
    if (new URL(pin.imageUrl).hostname !== PIN_HOST) throw new BadRequestException(`Pin ${pin.id}: images must be on ${PIN_HOST}`);
    return pin.imageUrl;
  }

  /** `freshPins` lines up with the new images (those after the kept ones); omit it when they are all uploads. */
  private async build(roomId: string, images: Buffer[], keptKeys: string[], freshPins: PinRef[] = [], keptMeta: ImageMeta = {}): Promise<StyleResponseDto> {
    await this.assertImages(images);
    const fresh = images.slice(keptKeys.length);
    const freshKeys = await Promise.all(fresh.map((img) => this.storage.save(`moodboards/${roomId}`, img, 'img', 'application/octet-stream')));
    const meta: ImageMeta = {};
    for (const k of keptKeys) if (keptMeta[k]) meta[k] = keptMeta[k];
    freshKeys.forEach((k, i) => {
      const pin = freshPins[i];
      if (pin) meta[k] = pin.link ? { url: pin.imageUrl, link: pin.link } : { url: pin.imageUrl };
    });
    const profile = await this.derive(images);
    return toStyleResponse(await this.repo.upsert(roomId, [...keptKeys, ...freshKeys], profile, meta));
  }

  private async derive(images: Buffer[]): Promise<StyleProfile> {
    const palette = await extractPalette(images);
    const vibe = await this.readVibe(images, palette);
    return this.buildProfile(palette, vibe);
  }

  async get(roomId: string, ownerId: string): Promise<StyleResponseDto> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    const style = await this.repo.findByRoom(roomId);
    if (!style) throw new NotFoundException('This room has no moodboard yet');
    return toStyleResponse(style);
  }

  async update(roomId: string, ownerId: string, dto: UpdateStyleDto): Promise<StyleResponseDto> {
    const current = (await this.get(roomId, ownerId)).profile;
    const next: StyleProfile = StyleProfile.parse({ ...current, ...dto, dials: mergeDials(current, dto), source: `${current.source} + edited` });
    if (dto.dials?.styling_density != null) next.stylingDensity = densityBand(next.dials.styling_density);
    return toStyleResponse(await this.repo.updateProfile(roomId, next));
  }

  /** For other modules: the room's style, or null if no moodboard yet. Caller must own the room. */
  async getProfile(roomId: string): Promise<StyleProfile | null> {
    const style = await this.repo.findByRoom(roomId);
    return style ? readProfile(style.profile) : null;
  }

  private async download(urls: string[]): Promise<Buffer[]> {
    return Promise.all(
      urls.map(async (u) => {
        try {
          const { body, contentType } = await safeFetch(u, { accept: 'image/*' });
          if (!contentType.startsWith('image/')) throw new Error('not an image');
          return body;
        } catch (e) {
          throw new BadRequestException(`Could not use image link ${u}: ${(e as Error).message}`);
        }
      }),
    );
  }

  private async assertImages(images: Buffer[]) {
    for (const [i, img] of images.entries()) {
      try {
        const meta = await sharp(img).metadata();
        if (!meta.width || !meta.height) throw new Error();
      } catch {
        throw new BadRequestException(`Image ${i + 1} is not a readable image`);
      }
    }
  }

  private async readVibe(images: Buffer[], palette: PaletteResult): Promise<Vibe> {
    try {
      return await this.reader.read(images, palette);
    } catch (e) {
      this.log.warn(`vibe reader failed, using rules instead: ${(e as Error).message}`);
      return this.fallbackReader.read(images, palette);
    }
  }

  private buildProfile(p: PaletteResult, v: Vibe): StyleProfile {
    return StyleProfile.parse({
      name: v.name,
      source: `moodboard (${v.source})`,
      palette: { dominant: p.dominant, secondary: p.secondary, accent: p.accent },
      keywords: v.keywords,
      vibe: v.vibe,
      shapeFamily: v.shapeFamily,
      materials: v.materials,
      stylingDensity: v.stylingDensity,
      warmth: p.warmth,
      saturation: p.saturation,
      lightness: p.lightness,
      dials: deriveDials(p, v),
    });
  }
}

/** Current dials + the edited ones. Editing the old stylingDensity choice moves its dial too, so the two never disagree. */
function mergeDials(current: StyleProfile, dto: UpdateStyleDto): StyleProfile['dials'] {
  const next = { ...current.dials, ...(dto.dials ?? {}) };
  if (dto.stylingDensity && dto.dials?.styling_density == null) next.styling_density = DENSITY_VALUE[dto.stylingDensity];
  return next;
}

const MIME: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', heif: 'image/heif' };

/** The image id is the file name in its storage key: moodboards/<room>/<uuid>.img → <uuid>. */
function imageIdOf(key: string): string {
  return (key.split('/').pop() ?? key).replace(/\.[^.]+$/, '');
}

function readMeta(json: unknown): ImageMeta {
  return json && typeof json === 'object' && !Array.isArray(json) ? { ...(json as ImageMeta) } : {};
}

function toImages(roomId: string, keys: string[], meta: ImageMeta): MoodboardImagesResponse['images'] {
  return keys.map((key) => {
    const id = imageIdOf(key);
    const pin = meta[key];
    return pin
      ? { id, url: pin.url, source: 'pin' as const, ...(pin.link ? { link: pin.link } : {}) }
      : { id, url: `/rooms/${roomId}/moodboard/images/${id}`, source: 'upload' as const };
  });
}
