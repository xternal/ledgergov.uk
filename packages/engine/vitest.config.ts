import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // At most three test workers on a laptop (Pavel's Mac has 16 GB and hung on 12 Oct 2026 with
    // several test runs and builds at once); CI keeps Vitest's default.
    maxWorkers: process.env.CI ? undefined : 3,
  },
});
