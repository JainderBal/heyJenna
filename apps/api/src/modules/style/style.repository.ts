import { Injectable } from '@nestjs/common';
import { Prisma, Style } from '@prisma/client';
import { StyleProfile } from '@hey-jenna/contracts';
import { PrismaService } from '../../common/database/prisma.service';

/** The only place that queries the styles table (one style per room). */
@Injectable()
export class StyleRepository {
  constructor(private readonly db: PrismaService) {}

  upsert(roomId: string, imageKeys: string[], profile: StyleProfile): Promise<Style> {
    const json = profile as unknown as Prisma.InputJsonValue;
    return this.db.style.upsert({
      where: { roomId },
      create: { roomId, imageKeys, profile: json },
      update: { imageKeys, profile: json },
    });
  }

  findByRoom(roomId: string): Promise<Style | null> {
    return this.db.style.findUnique({ where: { roomId } });
  }

  updateProfile(roomId: string, profile: StyleProfile): Promise<Style> {
    return this.db.style.update({ where: { roomId }, data: { profile: profile as unknown as Prisma.InputJsonValue } });
  }
}
