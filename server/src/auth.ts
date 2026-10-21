// Password protection for a public deployment: one shared password (APP_PASSWORD), a signed,
// HttpOnly session cookie, and a limit on wrong attempts. No user accounts, no database.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'site_ready_session';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export interface AuthConfig {
  password: string;
  /** Signs the cookies; when absent it is derived from the password (changing it logs everyone out). */
  secret?: string | null;
}

export interface Auth {
  checkPassword(password: string): boolean;
  /** Set-Cookie value for a new session. */
  sessionCookie(secure: boolean): string;
  /** Set-Cookie value that ends the session. */
  logoutCookie(secure: boolean): string;
  isAuthenticated(cookieHeader: string | undefined): boolean;
}

export function createAuth(config: AuthConfig): Auth {
  const key = config.secret || createHash('sha256').update(`site-ready-session:${config.password}`).digest('hex');
  const sign = (expires: string) => createHmac('sha256', key).update(expires).digest('base64url');
  const attributes = (secure: boolean) => `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

  return {
    checkPassword(password) {
      // Hash both sides so the comparison takes the same time whatever the lengths.
      const given = createHash('sha256').update(password).digest();
      const expected = createHash('sha256').update(config.password).digest();
      return timingSafeEqual(given, expected);
    },

    sessionCookie(secure) {
      const expires = String(Date.now() + SESSION_MS);
      return `${COOKIE_NAME}=${expires}.${sign(expires)}; Max-Age=${SESSION_MS / 1000}; ${attributes(secure)}`;
    },

    logoutCookie(secure) {
      return `${COOKIE_NAME}=; Max-Age=0; ${attributes(secure)}`;
    },

    isAuthenticated(cookieHeader) {
      const value = readCookie(cookieHeader, COOKIE_NAME);
      const [expires, signature] = value?.split('.') ?? [];
      if (!expires || !signature || !(Number(expires) > Date.now())) return false;
      const expected = Buffer.from(sign(expires));
      const given = Buffer.from(signature);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
  };
}

function readCookie(header: string | undefined, name: string): string | null {
  for (const part of header?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/** At most `max` wrong passwords per IP in a time window, against password guessing. */
export class LoginLimiter {
  readonly #max: number;
  readonly #windowMs: number;
  readonly #failures = new Map<string, { count: number; resetAt: number }>();

  constructor(max = 10, windowMs = 15 * 60 * 1000) {
    this.#max = max;
    this.#windowMs = windowMs;
  }

  isBlocked(ip: string): boolean {
    const entry = this.#failures.get(ip);
    if (!entry) return false;
    if (entry.resetAt <= Date.now()) {
      this.#failures.delete(ip);
      return false;
    }
    return entry.count >= this.#max;
  }

  recordFailure(ip: string): void {
    const now = Date.now();
    const entry = this.#failures.get(ip);
    if (!entry || entry.resetAt <= now) this.#failures.set(ip, { count: 1, resetAt: now + this.#windowMs });
    else entry.count++;
  }

  reset(ip: string): void {
    this.#failures.delete(ip);
  }
}
