import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
// After `npm run build` the server also serves the UI, so the whole app runs on one port.
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
const app = buildApp({ logger: true, staticDir: existsSync(clientDist) ? clientDist : undefined });

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
