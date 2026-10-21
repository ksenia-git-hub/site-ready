// All runtime settings come from environment variables (see .env.example).
// Secrets are never hard-coded and never sent to the client.

export interface AppConfig {
  port: number;
  host: string;
  /** When set, the app asks for this password before anything else. Unset: open access (local use). */
  appPassword: string | null;
  /** Signs the login cookie. Defaults to a value derived from the password. */
  sessionSecret: string | null;
  /**
   * Refuse to scan addresses of internal networks (localhost, 10.x, 192.168.x, cloud metadata…).
   * Must be on when the app is reachable from the internet; off locally to scan sites in development.
   */
  blockPrivateTargets: boolean;
  /** Behind a proxy (Render, a load balancer…): take the visitor's IP from X-Forwarded-For. */
  trustProxy: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: readInt(env.PORT, 3000),
    host: env.HOST || '127.0.0.1',
    appPassword: env.APP_PASSWORD || null,
    sessionSecret: env.SESSION_SECRET || null,
    blockPrivateTargets: readBool(env.BLOCK_PRIVATE_TARGETS, false),
    trustProxy: readBool(env.TRUST_PROXY, false),
  };
}

function readInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, got "${value}"`);
  }
  return parsed;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  throw new Error(`Expected true or false, got "${value}"`);
}
