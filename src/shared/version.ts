import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, '../../package.json');

interface PkgJson {
  version: string;
  name: string;
}

let cached: PkgJson | undefined;

function load(): PkgJson {
  if (!cached) {
    cached = JSON.parse(readFileSync(pkgPath, 'utf8')) as PkgJson;
  }
  return cached;
}

export function viszVersion(): string {
  return load().version;
}

export function viszName(): string {
  return load().name;
}
