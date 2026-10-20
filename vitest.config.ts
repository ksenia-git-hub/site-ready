import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'server/test/**/*.test.ts', 'client/src/**/*.test.ts'],
  },
});
