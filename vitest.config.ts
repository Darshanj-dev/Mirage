import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// WxtVitest gives tests the same aliases and auto-imports as the extension,
// plus an in-memory fake of the browser APIs.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
