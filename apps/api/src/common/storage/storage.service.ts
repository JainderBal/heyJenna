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
    const key = `${folder}/${randomUUID()}.${ext}`;
    if (this.config.get('STORAGE_DRIVER') === 'supabase') {
      const { error } = await this.client().storage.from(this.config.get('SUPABASE_BUCKET')).upload(key, data, { contentType });
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

  private client(): SupabaseClient {
    this.supabase ??= createClient(this.config.get('SUPABASE_URL')!, this.config.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    return this.supabase;
  }
}
