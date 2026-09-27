import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Unit tests for the pure rules — account eligibility, links, Google claim
 * checks, guardrails. Screens and flows are verified against a scratch
 * database in the browser, as for every earlier module; this runner exists so
 * the security rules have proof that does not depend on someone clicking.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'tests/**/*.test.ts'],
    // Worktrees made for other sessions live under .claude/ and carry their
    // own copy of the repo; never pick their tests up.
    exclude: ['node_modules/**', '.claude/**', '.next/**'],
  },
});
