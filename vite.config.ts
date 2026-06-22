import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@sidepanel': path.resolve(__dirname, 'src/sidepanel'),
      '@background': path.resolve(__dirname, 'src/background'),
      '@content': path.resolve(__dirname, 'src/content-scripts'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
