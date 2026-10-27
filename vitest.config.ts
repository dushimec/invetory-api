import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/stock?schema=public',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-longer-than-32-characters',
      JWT_REFRESH_SECRET:
        'test-refresh-secret-that-is-longer-than-32-characters',
    },
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
