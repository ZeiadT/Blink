import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**'],
    },
  },
  resolve: {
    alias: {
      '@sidepanel': path.resolve(__dirname, 'src/sidepanel'),
      '@background': path.resolve(__dirname, 'src/background'),
      '@content': path.resolve(__dirname, 'src/content-scripts'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
