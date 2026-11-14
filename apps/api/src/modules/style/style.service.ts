import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { densityBand, StyleProfile } from '@hey-jenna/contracts';
import sharp from 'sharp';
import { safeFetch } from '../../common/http/safe-fetch';
import { StorageService } from '../../common/storage/storage.service';
import { RoomsService } from '../rooms/rooms.service';
import { DENSITY_VALUE, deriveDials } from './analysis/dials';
import { RuleVibeReader } from './analysis/rule-vibe.reader';
import { extractPalette, PaletteResult } from './analysis/palette';
import { Vibe, VIBE_READER, VibeReader } from './analysis/vibe';
import { StyleResponseDto } from './dto/style-response.dto';
import { UpdateStyleDto } from './dto/update-style.dto';
import { readProfile, toStyleResponse } from './mappers/style.mapper';
import { StyleRepository } from './style.repository';

export interface MoodboardFile {
  buffer: Buffer;
  mimetype: string;
}

const MAX_IMAGES = 8;

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
    await this.assertImages(images);

    const keys = await Promise.all(images.map((img) => this.storage.save(`moodboards/${roomId}`, img, 'img', 'application/octet-stream')));
    const palette = await extractPalette(images);
    const vibe = await this.readVibe(images, palette);
    const profile = this.buildProfile(palette, vibe);
    return toStyleResponse(await this.repo.upsert(roomId, keys, profile));
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
