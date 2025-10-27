import { defineConfig } from 'vite';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';

const FRONTEND_PORT = Number(process.env.FRONTEND_PORT ?? process.env.PORT ?? 8080);
const API_PORT = Number(process.env.API_PORT ?? 3000);

export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: 'admin-spa-fallback',
      configureServer(server) {
        return () => {
          server.middlewares.use((req, res, next) => {
            const url = req.url || '';
            // Only handle /admin routes, not /admin/index.html or assets
            if (url === '/admin' || (url.startsWith('/admin/') && !url.includes('.') && !url.includes('?'))) {
              req.url = '/admin/index.html';
            }
            next();
          });
        };
      },
    },
  ],
  root: path.resolve(__dirname, '../src/frontend'),
  publicDir: path.resolve(__dirname, '../src/frontend/public'),
  envDir: path.resolve(__dirname, '..'),
  server: {
    port: FRONTEND_PORT,
    host: '0.0.0.0',
    fs: {
      allow: [
        path.resolve(__dirname, '..'), // project root
      ],
    },
    proxy: {
      '^/api/': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: FRONTEND_PORT,
    host: '0.0.0.0',
  },
  build: {
    outDir: path.resolve(__dirname, '../dist/frontend'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, '../src/frontend/index.html'),
        admin: path.resolve(__dirname, '../src/frontend/admin/index.html'),
        install: path.resolve(__dirname, '../src/frontend/install.html'),
      },
    },
  },
});
