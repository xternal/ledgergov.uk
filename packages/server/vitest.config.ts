import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Many tests start an in-memory Postgres (PGlite), which can take seconds when the
    // machine is busy (CI, or several test runs at once); 5 s made them fail at random.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // At most three test workers on a laptop (Pavel's Mac has 16 GB and hung on 12 Oct 2026 with
    // several test runs and builds at once); CI keeps Vitest's default.
    maxWorkers: process.env.CI ? undefined : 3,
  },
});
