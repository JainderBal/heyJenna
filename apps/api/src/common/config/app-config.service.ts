import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env';

/** Typed access to settings: config.get('PORT') is a number, not a string. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}
  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }
}
