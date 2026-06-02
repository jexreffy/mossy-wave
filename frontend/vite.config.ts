import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // loadEnv makes .env.local vars available in the config file itself
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    // amazon-cognito-identity-js uses Node's `global` — polyfill it for the browser
    define: {
      global: 'globalThis',
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
