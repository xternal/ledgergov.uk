import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // test/also-by.test.ts renders a web app component and runs its llms.txt route: resolve the app's "@/" imports, and
  // compile its JSX here, where the app's tsconfig says "preserve" because Next.js compiles it there.
  resolve: { alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("../../apps/web/", import.meta.url)) }] },
  oxc: { jsx: { runtime: "automatic" } },
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
