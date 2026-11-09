import { defineConfig, type Connect, type Plugin } from 'vite';
import path from 'path';

const cacheCardFaces: Connect.NextHandleFunction = (request, response, next) => {
  if (/^\/(?:[^?]*\/)?card-faces\/(?:small|large)\/[a-f0-9]{24}\.webp(?:\?|$)/.test(request.url ?? '')) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
};
const cardFaceCache: Plugin = {
  name: 'card-face-cache',
  configureServer(server) { server.middlewares.use(cacheCardFaces); },
  configurePreviewServer(server) { server.middlewares.use(cacheCardFaces); },
};

export default defineConfig({
  plugins: [cardFaceCache],
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
    },
  },
});
