import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __BUILD_DATE__: JSON.stringify('test'),
    __SINGLE_FILE__: 'false',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
