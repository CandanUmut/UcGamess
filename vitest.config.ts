import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'games/**/src/**/*.test.ts'],
    environment: 'node',
    // Anything needing a DOM declares `@vitest-environment jsdom` at the top of
    // the file, so the default stays fast.
    passWithNoTests: false,
  },
});
