import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createTargetGuard } from './scan/network-guard.ts';

const config = loadConfig();
// After `npm run build` the server also serves the UI, so the whole app runs on one port.
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
const app = buildApp({
  logger: true,
  staticDir: existsSync(clientDist) ? clientDist : undefined,
  auth: config.appPassword ? { password: config.appPassword, secret: config.sessionSecret } : null,
  guard: config.blockPrivateTargets ? createTargetGuard() : null,
  trustProxy: config.trustProxy,
});
if (!config.appPassword && config.host !== '127.0.0.1' && config.host !== 'localhost') {
  app.log.warn('APP_PASSWORD is not set: anyone who can reach this server can use it.');
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
