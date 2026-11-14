import { Injectable } from '@nestjs/common';
import { Listing, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

export type NewListing = Omit<Prisma.ListingUncheckedCreateInput, 'id' | 'roomId' | 'createdAt'>;

/** The only place that queries the listings table. */
@Injectable()
export class ListingsRepository {
  constructor(private readonly db: PrismaService) {}

  /**
   * Swap in fresh search results for these types in ONE transaction (unit of work):
   * unpicked old results go, new ones are upserted; picked ones are kept.
   */
  replaceUnpicked(roomId: string, types: string[], items: NewListing[]): Promise<Listing[]> {
    return this.db.$transaction(async (tx) => {
      await tx.listing.deleteMany({ where: { roomId, type: { in: types }, picked: false } });
      const saved: Listing[] = [];
      for (const item of items) {
        saved.push(
          await tx.listing.upsert({
            where: { roomId_source_externalId: { roomId, source: item.source, externalId: item.externalId } },
            create: { ...item, roomId },
            update: { ...item, picked: undefined },
          }),
        );
      }
      return saved;
    });
  }

  upsertOne(roomId: string, item: NewListing): Promise<Listing> {
    return this.db.listing.upsert({
      where: { roomId_source_externalId: { roomId, source: item.source, externalId: item.externalId } },
      create: { ...item, roomId },
      update: item,
    });
  }

  listByRoom(roomId: string, type?: string): Promise<Listing[]> {
    return this.db.listing.findMany({
      where: { roomId, ...(type ? { type } : {}) },
      orderBy: [{ type: 'asc' }, { picked: 'desc' }, { score: 'desc' }],
    });
  }

  findInRoom(id: string, roomId: string): Promise<Listing | null> {
    return this.db.listing.findFirst({ where: { id, roomId } });
  }

  /** Details read later from the product page: real size and/or 3D model link ("" = none on the page). */
  setDetails(id: string, details: { size?: Prisma.InputJsonValue; modelUrl: string; price?: number }): Promise<Listing> {
    return this.db.listing.update({
      where: { id },
      data: {
        modelUrl: details.modelUrl,
        ...(details.size ? { size: details.size, sizeEstimated: false } : {}),
        ...(details.price ? { price: details.price } : {}),
      },
    });
  }

  setPicked(id: string, picked: boolean): Promise<Listing> {
    return this.db.listing.update({ where: { id }, data: { picked } });
  }
}
