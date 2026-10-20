import { extname } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  DEFAULT_MAX_PAGES,
  MAX_PAGES_LIMIT,
  SCREENSHOT_DEVICES,
  type ApiError,
  type ApiErrorCode,
  type CreateScanRequest,
  type CreateScanResponse,
  type HealthResponse,
  type ScreenshotDevice,
} from '@qa/shared';
import { ScanQueue } from './scan-queue.ts';
import { runScan } from './scan/scanner.ts';
import type { Scanner } from './scan/types.ts';

export interface BuildAppOptions {
  logger?: boolean;
  /** Replaced by a fake in tests so they don't start a real browser. */
  scanner?: Scanner;
  /** Folder with the built client (client/dist). When set, the server also serves the UI. */
  staticDir?: string;
}

// The app is built by a factory instead of being started at import time,
// so tests can create an instance and call routes via app.inject() without opening a port.
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const queue = new ScanQueue(options.scanner ?? runScan);

  app.get('/api/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));

  app.post<{ Body: CreateScanRequest }>(
    '/api/scans',
    {
      schema: {
        body: {
          type: 'object',
          required: ['url'],
          additionalProperties: false,
          properties: {
            url: { type: 'string', minLength: 1, maxLength: 2048 },
            maxPages: { type: 'integer', minimum: 1, maximum: MAX_PAGES_LIMIT },
          },
        },
      },
    },
    async (request, reply) => {
      const url = parseTargetUrl(request.body.url);
      if (!url) {
        return reply.code(400).send(apiError('invalidUrl', 'Not a valid http(s) address'));
      }
      const job = queue.enqueue(url, { maxPages: request.body.maxPages ?? DEFAULT_MAX_PAGES });
      const body: CreateScanResponse = { id: job.id };
      return reply.code(202).send(body);
    },
  );

  app.get<{ Params: { id: string } }>('/api/scans/:id', async (request, reply) => {
    const job = queue.get(request.params.id);
    if (!job) return reply.code(404).send(apiError('scanNotFound', 'Scan not found (the server may have restarted)'));
    return job;
  });

  // Stops a queued or running scan (the user changed their mind or mistyped the address).
  app.post<{ Params: { id: string } }>('/api/scans/:id/cancel', async (request, reply) => {
    const result = queue.cancel(request.params.id);
    if (result === null) return reply.code(404).send(apiError('scanNotFound', 'Scan not found (the server may have restarted)'));
    if (result === 'notCancellable') return reply.code(409).send(apiError('notCancellable', 'The scan has already finished'));
    return result;
  });

  app.get<{ Params: { id: string; page: string; device: string } }>(
    '/api/scans/:id/screenshots/:page/:device',
    async (request, reply) => {
      const { id, page, device } = request.params;
      const image = (SCREENSHOT_DEVICES as readonly string[]).includes(device)
        ? queue.getScreenshot(id, Number(page), device as ScreenshotDevice)
        : null;
      if (!image) return reply.code(404).send(apiError('notFound', 'Screenshot not found'));
      // A screenshot of a finished scan never changes.
      return reply.type('image/jpeg').header('cache-control', 'private, max-age=86400, immutable').send(image);
    },
  );

  if (options.staticDir) {
    // Files are looked up on disk at request time, so a rebuilt client is served without a restart.
    app.register(fastifyStatic, { root: options.staticDir });
    // Other page addresses get the single-page app; a missing file (e.g. an old /assets/x.js) stays a 404,
    // otherwise the browser would receive HTML where it expects JavaScript.
    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split('?')[0]!;
      if (request.method === 'GET' && !path.startsWith('/api/') && !extname(path)) return reply.sendFile('index.html');
      return reply.code(404).send(apiError('notFound', 'Not found'));
    });
  }

  return app;
}

/** Accepts "example.com" as well as full URLs; returns null for anything that isn't a web address. */
export function parseTargetUrl(input: string): string | null {
  const trimmed = input.trim();
  // "mailto:x" and "https://x" have a scheme; "localhost:4000" is a host with a port.
  const hasScheme = /^[a-z][a-z0-9+.-]*:(\/\/|(?!\d))/i.test(trimmed);
  // Local dev sites rarely have HTTPS.
  const defaultScheme = /^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(trimmed) ? 'http' : 'https';
  const withScheme = hasScheme ? trimmed : `${defaultScheme}://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function apiError(code: ApiErrorCode, message: string): ApiError {
  return { code, message };
}
