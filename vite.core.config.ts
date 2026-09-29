// Builds MIRAGE Core (lib/core/api.ts) as one self-contained script for JavaScriptCore:
//   npm run build:core  ->  desktop/Sources/MirageCore/Resources/mirage-core.js
// The browser extension does not use this file; it imports the same modules directly.
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    lib: { entry: 'lib/core/api.ts', name: 'MirageCore', formats: ['iife'], fileName: () => 'mirage-core.js' },
    outDir: 'desktop/Sources/MirageCore/Resources',
    emptyOutDir: false,
    minify: false,
    target: 'safari16.4',
  },
});
