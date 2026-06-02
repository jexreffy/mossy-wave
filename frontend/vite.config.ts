/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // loadEnv makes .env.local vars available in the config file itself
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: { global: 'globalThis' },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/__tests__/setup.ts'],
    },
    server: {
      proxy: {
        // During local dev, proxy /api/* to the deployed API Gateway URL
        '/api': {
          target: env.VITE_API_URL ?? 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
