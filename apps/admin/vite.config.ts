import { defineConfig } from 'vite';

export default defineConfig({
  base: '/admin/',
  esbuild: { jsx: 'automatic' },
  server: {
    proxy: {
      '/admin/api': 'http://127.0.0.1:10000',
      '/admin/auth': 'http://127.0.0.1:10000',
    },
  },
});
