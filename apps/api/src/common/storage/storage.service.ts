import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { AppConfig } from '../config/app-config.service';

/** Saves uploaded files (moodboard images). Local disk in dev, Supabase Storage in production. */
@Injectable()
export class StorageService {
  private readonly localRoot = resolve(process.cwd(), 'uploads');
  private supabase?: SupabaseClient;

  constructor(private readonly config: AppConfig) {}

  async save(folder: string, data: Buffer, ext: string, contentType: string): Promise<string> {
    return this.saveAs(`${folder}/${randomUUID()}.${ext}`, data, contentType);
  }

  /** Save under a fixed key (a cache: same input → same key), replacing what was there. */
  async saveAs(key: string, data: Buffer, contentType: string): Promise<string> {
    if (this.config.get('STORAGE_DRIVER') === 'supabase') {
      const { error } = await this.client().storage.from(this.config.get('SUPABASE_BUCKET')).upload(key, data, { contentType, upsert: true });
      if (error) throw error;
    } else {
      const path = join(this.localRoot, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    }
    return key;
  }

  async load(key: string): Promise<Buffer> {
    if (this.config.get('STORAGE_DRIVER') === 'supabase') {
      const { data, error } = await this.client().storage.from(this.config.get('SUPABASE_BUCKET')).download(key);
      if (error) throw error;
      return Buffer.from(await data.arrayBuffer());
    }
    return readFile(join(this.localRoot, key));
  }

  /** The file, or null if nothing is stored under this key. */
  async tryLoad(key: string): Promise<Buffer | null> {
    try {
      return await this.load(key);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      if (this.config.get('STORAGE_DRIVER') === 'supabase') return null; // supabase-js reports "not found" as a generic error
      throw e;
    }
  }

  private client(): SupabaseClient {
    this.supabase ??= createClient(this.config.get('SUPABASE_URL')!, this.config.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    return this.supabase;
  }
}
