import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // "@/components/ui/button" instead of long relative paths (shadcn/ui convention).
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // In development the browser talks only to Vite; /api requests are forwarded to the API server.
    // This avoids CORS configuration entirely.
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
