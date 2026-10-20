// All runtime settings come from environment variables (see .env.example).
// Secrets are never hard-coded and never sent to the client.

export interface AppConfig {
  port: number;
  host: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: readInt(env.PORT, 3000),
    host: env.HOST || '127.0.0.1',
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
