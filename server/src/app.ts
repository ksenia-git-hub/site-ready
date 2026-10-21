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
  type LoginRequest,
  type ScreenshotDevice,
  type SessionResponse,
} from '@qa/shared';
import { LoginLimiter, createAuth, type AuthConfig } from './auth.ts';
import { ScanQueue } from './scan-queue.ts';
import type { TargetGuard } from './scan/network-guard.ts';
import { runScan } from './scan/scanner.ts';
import type { Scanner } from './scan/types.ts';

export interface BuildAppOptions {
  logger?: boolean;
  /** Replaced by a fake in tests so they don't start a real browser. */
  scanner?: Scanner;
  /** Folder with the built client (client/dist). When set, the server also serves the UI. */
  staticDir?: string;
  /** Password protection; null or absent = open access (local use). */
  auth?: AuthConfig | null;
  /** Refuses internal-network addresses (start URL, and everything the scan opens). */
  guard?: TargetGuard | null;
  /** Behind a proxy: the visitor's IP comes from X-Forwarded-For. */
  trustProxy?: boolean;
  /** Small server: fewer pages per scan, lighter screenshots, fewer reports with screenshots kept. */
  lowMemory?: { maxPages: number } | null;
}

/** On a small server only the latest reports keep their screenshots. */
const LOW_MEMORY_JOBS_WITH_SCREENSHOTS = 3;

/** One visitor can have this many scans queued or running at once… */
const MAX_SCANS_PER_CLIENT = 2;
/** …and the whole queue holds at most this many. */
const MAX_QUEUED_SCANS = 20;
/** API routes reachable without logging in. */
const PUBLIC_ROUTES = new Set(['/api/health', '/api/session', '/api/login', '/api/logout']);

// The app is built by a factory instead of being started at import time,
// so tests can create an instance and call routes via app.inject() without opening a port.
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false, trustProxy: options.trustProxy ?? false });
  const lowMemory = options.lowMemory ?? null;
  const maxPages = lowMemory ? Math.min(lowMemory.maxPages, MAX_PAGES_LIMIT) : MAX_PAGES_LIMIT;
  const queue = lowMemory
    ? new ScanQueue(options.scanner ?? runScan, undefined, LOW_MEMORY_JOBS_WITH_SCREENSHOTS)
    : new ScanQueue(options.scanner ?? runScan);
  const auth = options.auth ? createAuth(options.auth) : null;
  const loginLimiter = new LoginLimiter();
  const guard = options.guard ?? undefined;

  app.get('/api/health', async (): Promise<HealthResponse> => ({ status: 'ok' }));

  // Every other API route (scans, reports, screenshots) needs the session cookie when a password is set.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    if (!auth || !path.startsWith('/api/') || PUBLIC_ROUTES.has(path)) return;
    if (!auth.isAuthenticated(request.headers.cookie)) {
      return reply.code(401).send(apiError('unauthorized', 'Log in first'));
    }
  });

  app.get('/api/session', async (request): Promise<SessionResponse> => ({
    authRequired: auth !== null,
    authenticated: auth === null || auth.isAuthenticated(request.headers.cookie),
    maxPages,
  }));

  app.post<{ Body: LoginRequest }>(
    '/api/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: { password: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (request, reply) => {
      if (!auth) return { ok: true };
      if (loginLimiter.isBlocked(request.ip)) {
        return reply.code(429).send(apiError('tooManyAttempts', 'Too many wrong passwords, try again later'));
      }
      if (!auth.checkPassword(request.body.password)) {
        loginLimiter.recordFailure(request.ip);
        return reply.code(401).send(apiError('wrongPassword', 'Wrong password'));
      }
      loginLimiter.reset(request.ip);
      return reply.header('set-cookie', auth.sessionCookie(request.protocol === 'https')).send({ ok: true });
    },
  );

  app.post('/api/logout', async (request, reply) => {
    if (auth) reply.header('set-cookie', auth.logoutCookie(request.protocol === 'https'));
    return reply.send({ ok: true });
  });

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
      if (guard && !(await guard(url))) {
        return reply.code(400).send(apiError('privateAddress', 'Addresses of internal networks cannot be scanned'));
      }
      if (queue.activeCount(request.ip) >= MAX_SCANS_PER_CLIENT || queue.activeCount() >= MAX_QUEUED_SCANS) {
        return reply.code(429).send(apiError('tooManyScans', 'Too many scans at once, wait for one to finish'));
      }
      // Older clients or a recent-scan rerun may ask for more than this server allows: scan fewer.
      const pages = Math.min(request.body.maxPages ?? DEFAULT_MAX_PAGES, maxPages);
      const job = queue.enqueue(url, { maxPages: pages, guard, lowMemory: lowMemory !== null }, request.ip);
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
