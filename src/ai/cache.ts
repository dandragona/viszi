import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { cacheSubdir, ensureDir } from '../shared/paths.js';
import { SCHEMA_VERSION } from './schemas.js';

export interface CacheKey {
  promptName: string;
  scope: string;
  level: number;
  contentHash: string;
}

export class AiCache {
  private readonly dir: string;
  constructor(outputDir: string, private enabled: boolean = true) {
    this.dir = cacheSubdir(outputDir);
    if (this.enabled) ensureDir(this.dir);
  }

  static hashContent(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
  }

  private file(key: CacheKey): string {
    const k = `${key.promptName}__${key.scope || 'root'}__L${key.level}__${SCHEMA_VERSION}__${key.contentHash}`;
    const safe = k.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 220);
    return resolve(this.dir, `${safe}.json`);
  }

  get<T>(key: CacheKey): T | undefined {
    if (!this.enabled) return undefined;
    const f = this.file(key);
    if (!existsSync(f)) return undefined;
    try {
      return JSON.parse(readFileSync(f, 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  set<T>(key: CacheKey, value: T): void {
    if (!this.enabled) return;
    writeFileSync(this.file(key), JSON.stringify(value, null, 2), 'utf8');
  }
}
