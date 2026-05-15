import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { diagramsSubdir, indexFile, sanitizeId, metaFile } from '../shared/paths.js';
import type { EventBus } from './eventBus.js';

export interface RoutesOpts {
  outputDir: string;
  bus?: EventBus;
}

export async function registerApiRoutes(app: FastifyInstance, opts: RoutesOpts): Promise<void> {
  const { outputDir } = opts;

  app.get('/api/index', async (_req, reply) => {
    const f = indexFile(outputDir);
    if (!existsSync(f)) {
      reply.code(404);
      return { error: 'index.json not found — run `viszi <path>` first.' };
    }
    reply.header('cache-control', 'no-cache');
    return JSON.parse(readFileSync(f, 'utf8'));
  });

  app.get('/api/meta', async (_req, reply) => {
    const f = metaFile(outputDir);
    if (!existsSync(f)) {
      reply.code(404);
      return { error: 'meta.json not found' };
    }
    return JSON.parse(readFileSync(f, 'utf8'));
  });

  app.get<{ Params: { id: string } }>('/api/diagrams/:id', async (req, reply) => {
    const safe = sanitizeId(req.params.id);
    const f = resolve(diagramsSubdir(outputDir), `${safe}.json`);
    if (!existsSync(f)) {
      reply.code(404);
      return { error: `Diagram '${req.params.id}' not found.` };
    }
    reply.header('cache-control', 'no-cache');
    return JSON.parse(readFileSync(f, 'utf8'));
  });

  app.get('/api/search', async (_req, reply) => {
    const f = resolve(outputDir, 'search.json');
    if (!existsSync(f)) {
      reply.code(404);
      return [];
    }
    reply.header('cache-control', 'no-cache');
    return JSON.parse(readFileSync(f, 'utf8'));
  });

  app.get('/api/status', async () => {
    return opts.bus
      ? opts.bus.state
      : { state: existsSync(indexFile(outputDir)) ? 'done' : 'idle', diagrams: [], aiCallCount: 0, estimatedCostUsd: 0 };
  });
}
