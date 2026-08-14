import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * Tests are colocated next to the source they cover and named `*.test.ts` or
 * `*.test.tsx` (for example `lib/api/client.test.ts`,
 * `components/home/contact-form.test.tsx`). This convention is binding on the
 * whole application; there is no separate test tree.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.ts?(x)'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
