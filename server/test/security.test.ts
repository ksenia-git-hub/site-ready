import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { createTargetGuard, isPrivateAddress } from '../src/scan/network-guard.ts';
import { buildReport } from '../src/scan/report.ts';
import type { ScanResult, Scanner } from '../src/scan/types.ts';

const emptyResult = (url: string): ScanResult => ({
  report: buildReport({ startUrl: url, pages: [], drafts: [], warnings: [], linksChecked: 0, imagesChecked: 0, durationMs: 1 }),
  screenshots: [],
});
/** A scan that never ends, to fill the queue. */
const endless: Scanner = () => new Promise(() => {});

describe('password protection', () => {
  const app = () => buildApp({ scanner: async (url) => emptyResult(url), auth: { password: 'segreto-123' } });
  const cookieOf = (response: { headers: Record<string, unknown> }) => String(response.headers['set-cookie']).split(';')[0]!;

  it('keeps the API closed until the right password is given', async () => {
    const server = app();
    expect((await server.inject({ method: 'GET', url: '/api/session' })).json()).toEqual({ authRequired: true, authenticated: false });
    expect((await server.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.com' } })).statusCode).toBe(401);
    // Health stays public for the hosting's checks.
    expect((await server.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);

    const wrong = await server.inject({ method: 'POST', url: '/api/login', payload: { password: 'nope' } });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().code).toBe('wrongPassword');

    const login = await server.inject({ method: 'POST', url: '/api/login', payload: { password: 'segreto-123' } });
    expect(login.statusCode).toBe(200);
    expect(String(login.headers['set-cookie'])).toMatch(/HttpOnly/);
    const cookie = cookieOf(login);

    expect((await server.inject({ method: 'GET', url: '/api/session', headers: { cookie } })).json()).toEqual({ authRequired: true, authenticated: true });
    const scan = await server.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.com' }, headers: { cookie } });
    expect(scan.statusCode).toBe(202);
    await server.close();
  });

  it('rejects forged or tampered cookies', async () => {
    const server = app();
    const login = await server.inject({ method: 'POST', url: '/api/login', payload: { password: 'segreto-123' } });
    const [name, value] = cookieOf(login).split('=');
    const [expires, signature] = value!.split('.');
    const tampered = `${name}=${Number(expires) + 1_000_000}.${signature}`;
    expect((await server.inject({ method: 'GET', url: '/api/scans/x', headers: { cookie: tampered } })).statusCode).toBe(401);
    expect((await server.inject({ method: 'GET', url: '/api/scans/x', headers: { cookie: `${name}=123.abc` } })).statusCode).toBe(401);
    await server.close();
  });

  it('blocks password guessing after 10 wrong attempts', async () => {
    const server = app();
    for (let i = 0; i < 10; i++) await server.inject({ method: 'POST', url: '/api/login', payload: { password: `guess-${i}` } });
    const blocked = await server.inject({ method: 'POST', url: '/api/login', payload: { password: 'segreto-123' } });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe('tooManyAttempts');
    await server.close();
  });

  it('stays open when no password is configured (local use)', async () => {
    const server = buildApp({ scanner: async (url) => emptyResult(url) });
    expect((await server.inject({ method: 'GET', url: '/api/session' })).json()).toEqual({ authRequired: false, authenticated: true });
    expect((await server.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.com' } })).statusCode).toBe(202);
    await server.close();
  });
});

describe('internal-network protection', () => {
  it('recognizes private, loopback and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2a00:1450:4001::1']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('refuses to scan internal addresses when the guard is on', async () => {
    const server = buildApp({ scanner: async (url) => emptyResult(url), guard: createTargetGuard() });
    for (const url of ['localhost:3000', 'http://127.0.0.1/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/']) {
      const response = await server.inject({ method: 'POST', url: '/api/scans', payload: { url } });
      expect(response.statusCode, url).toBe(400);
      expect(response.json().code).toBe('privateAddress');
    }
    expect((await server.inject({ method: 'POST', url: '/api/scans', payload: { url: 'http://93.184.216.34/' } })).statusCode).toBe(202);
    await server.close();
  });
});

describe('scan limits', () => {
  it('lets one visitor run at most 2 scans at once', async () => {
    const server = buildApp({ scanner: endless });
    const start = () => server.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.com' } });
    expect((await start()).statusCode).toBe(202);
    expect((await start()).statusCode).toBe(202);
    const third = await start();
    expect(third.statusCode).toBe(429);
    expect(third.json().code).toBe('tooManyScans');
    await server.close();
  });
});
