import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import getPort from 'get-port';
import open from 'open';
import { registerApiRoutes } from './routes.js';
import { webDistDir } from '../shared/paths.js';
import type { BusMessage, EventBus } from './eventBus.js';

export interface ServeOpts {
  outputDir: string;
  port?: number;
  host?: string;
  openBrowser?: boolean;
  log?: (msg: string) => void;
  bus?: EventBus;
}

export async function startServer(opts: ServeOpts): Promise<{
  app: FastifyInstance;
  port: number;
  url: string;
  close: () => Promise<void>;
}> {
  const log = opts.log ?? (() => {});
  const port = opts.port ?? (await getPort({ port: [4321, 4322, 4323, 5173, 5174] }));
  const host = opts.host ?? '127.0.0.1';

  const app = Fastify({ logger: false, disableRequestLogging: true });

  const distDir = webDistDir();
  if (existsSync(distDir)) {
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
      decorateReply: true,
    });
  } else {
    log(
      `[viszi] Built web SPA not found at ${distDir}. Run \`npm run build:web\` to render diagrams in the browser. The /api endpoints still work.`,
    );
  }

  await app.register(fastifyWebsocket);
  await registerApiRoutes(app, { outputDir: opts.outputDir, bus: opts.bus });

  if (opts.bus) {
    const bus = opts.bus;
    app.get('/ws/progress', { websocket: true }, (socket /* fastify v4 hands raw WebSocket */) => {
      // Send the current state immediately so the client doesn't need /api/status round-trip.
      try {
        socket.send(JSON.stringify({ type: 'state', state: bus.state } satisfies BusMessage));
      } catch {
        /* socket may have closed already */
      }
      const unsub = bus.subscribe((msg) => {
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          /* ignore */
        }
      });
      socket.on('close', unsub);
      socket.on('error', unsub);
    });
  }

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }
    if (existsSync(resolve(distDir, 'index.html'))) {
      reply.sendFile('index.html');
      return;
    }
    reply
      .code(503)
      .type('text/html')
      .send(
        `<!doctype html><meta charset=utf-8><title>viszi</title><pre style="font-family:ui-monospace,monospace;padding:2rem">viszi: web bundle is missing.\n\nRun:\n    npm run build:web\nthen restart this server.</pre>`,
      );
  });

  await app.listen({ port, host });
  const url = `http://${host}:${port}`;
  log(`[viszi] Serving diagrams at ${url}`);

  if (opts.openBrowser !== false) {
    try {
      await open(url);
    } catch (err) {
      log(`[viszi] Could not open browser: ${(err as Error).message}`);
    }
  }

  return {
    app,
    port,
    url,
    close: async () => {
      await app.close();
    },
  };
}
