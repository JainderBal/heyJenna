import { Injectable } from '@nestjs/common';
import { Prisma, Style } from '@prisma/client';
import { StyleProfile } from '@hey-jenna/contracts';
import { PrismaService } from '../../common/database/prisma.service';

/** Pinned images only: storage key → where the pin came from. Keys not listed are uploads. */
export type ImageMeta = Record<string, { url: string; link?: string }>;

/** The only place that queries the styles table (one style per room). */
@Injectable()
export class StyleRepository {
  constructor(private readonly db: PrismaService) {}

  upsert(roomId: string, imageKeys: string[], profile: StyleProfile, imageMeta: ImageMeta = {}): Promise<Style> {
    const json = profile as unknown as Prisma.InputJsonValue;
    return this.db.style.upsert({
      where: { roomId },
      create: { roomId, imageKeys, imageMeta, profile: json },
      update: { imageKeys, imageMeta, profile: json },
    });
  }

  /** A room with no style row is a room with no moodboard yet. */
  async delete(roomId: string): Promise<void> {
    await this.db.style.deleteMany({ where: { roomId } });
  }

  findByRoom(roomId: string): Promise<Style | null> {
    return this.db.style.findUnique({ where: { roomId } });
  }

  /** The home's style for a room with no moodboard of its own: the newest moodboard of another room in its project. */
  async findForProjectOf(roomId: string): Promise<Style | null> {
    const room = await this.db.room.findUnique({ where: { id: roomId }, select: { projectId: true } });
    if (!room?.projectId) return null;
    return this.db.style.findFirst({ where: { room: { projectId: room.projectId }, NOT: { roomId } }, orderBy: { updatedAt: 'desc' } });
  }

  updateProfile(roomId: string, profile: StyleProfile): Promise<Style> {
    return this.db.style.update({ where: { roomId }, data: { profile: profile as unknown as Prisma.InputJsonValue } });
  }
}
