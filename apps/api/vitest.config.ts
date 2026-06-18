import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // Resolve the workspace package to source so vi.mock can register against it
      // without requiring a prior build.
      '@docmee/queue': fileURLToPath(new URL('../../packages/queue/src/index.ts', import.meta.url)),
    },
  },
})
