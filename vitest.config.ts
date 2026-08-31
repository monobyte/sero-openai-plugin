import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['shared/__tests__/**/*.test.ts', 'extension/__tests__/**/*.test.ts', 'ui/__tests__/**/*.test.tsx'],
    environment: 'node',
    server: { deps: { inline: ['@sero-ai/ui'] } },
  },
});
