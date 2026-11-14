import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AppConfig } from '../../common/config/app-config.service';
import { csv } from '../../common/config/env';
import { safeFetch } from '../../common/http/safe-fetch';
import { StorageService } from '../../common/storage/storage.service';
import { SourcingService } from '../sourcing/sourcing.service';
import { BadModelError, checkGlb, checkModelUrl, MAX_MODEL_BYTES } from './model-source';

export interface ModelFile {
  data: Buffer;
  cached: boolean;
}

/** Fetches a product's 3D model (GLB) once from an allowed host, keeps it in storage, serves it from there. */
@Injectable()
export class ModelsService {
  private readonly log = new Logger(ModelsService.name);
  private readonly inFlight = new Map<string, Promise<ModelFile>>(); // one download per URL at a time

  constructor(private readonly storage: StorageService, private readonly config: AppConfig, private readonly sourcing: SourcingService) {}

  async byUrl(raw: string): Promise<ModelFile> {
    let url: URL;
    try {
      url = checkModelUrl(raw, csv(this.config.get('MODEL_HOSTS')));
    } catch (e) {
      if (e instanceof BadModelError) throw new BadRequestException(e.message);
      throw e;
    }
    const key = `models/${createHash('sha256').update(url.toString()).digest('hex')}.glb`;
    const cached = await this.storage.tryLoad(key);
    if (cached) return { data: cached, cached: true };

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.download(url, key).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }
    return pending;
  }

  /** The 3D model of one of the room's listings (the caller owns the room). */
  async byListing(roomId: string, ownerId: string, listingId: string): Promise<ModelFile> {
    const listing = await this.sourcing.getOwnedListing(roomId, ownerId, listingId);
    const detailed = await this.sourcing.ensureDetails(listing); // reads the product page once if needed
    if (!detailed.modelUrl) throw new NotFoundException('This product has no 3D model');
    return this.byUrl(detailed.modelUrl);
  }

  private async download(url: URL, key: string): Promise<ModelFile> {
    let data: Buffer;
    try {
      // safeFetch re-checks every redirect for private addresses; the host rule applies to where we start
      data = checkGlb((await safeFetch(url.toString(), { maxBytes: MAX_MODEL_BYTES, timeoutMs: 30_000, accept: 'model/gltf-binary,*/*' })).body);
    } catch (e) {
      throw new BadRequestException(`Couldn't fetch the 3D model: ${(e as Error).message}`);
    }
    await this.storage.saveAs(key, data, 'model/gltf-binary');
    this.log.log(`cached 3D model ${url.pathname.split('/').pop()} (${(data.length / 1e6).toFixed(1)} MB)`);
    return { data, cached: false };
  }
}
