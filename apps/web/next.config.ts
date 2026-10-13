import path from "node:path";
import type { NextConfig } from "next";

const root = path.join(import.meta.dirname, "../..");

const config: NextConfig = {
  // Workspace packages ship TypeScript source; seed JSON lives at the repo root.
  transpilePackages: ["@ledger/engine", "@ledger/schema", "@ledger/server"],
  // Node-only server dependencies (database, mail, Claude API) load at runtime, not bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "@aws-sdk/client-sesv2", "@anthropic-ai/sdk"],
  // Server routes (follow, submissions, triage) read content/*.yaml at runtime; ship it with them. Pages made on first
  // visit or re-rendered later read the data build and seeds too (scorecards, contracts, forecasts, the data editions,
  // HMRC's tax figures, the tax seeds): a shared Pay for it plan returned a 500 on 13 October 2026 because
  // data/build/manifest.json had not shipped. All of data/build and data/seed is about 3 MB, so all of it ships.
  outputFileTracingIncludes: {
    "/**": [
      "../../content/**/*",
      "../../pnpm-workspace.yaml",
      "../../data/build/**/*",
      "../../data/seed/*.json",
    ],
  },
  turbopack: { root },
  outputFileTracingRoot: root,
  poweredByHeader: false,
  images: {
    // MPs' official portraits (/mp pages), fetched by our server so readers' browsers never call Parliament.
    remotePatterns: [{ protocol: "https", hostname: "members-api.parliament.uk", port: "", pathname: "/api/Members/*/Thumbnail", search: "" }],
    maximumRedirects: 0,
    minimumCacheTTL: 86400,
  },
  // Each promise card as Markdown for AI assistants: /promise/<id>.md, served by app/md/promise/[file] (the card page owns /promise/[id]).
  async rewrites() {
    return [{ source: "/promise/:file([a-z0-9-]+\\.md)", destination: "/md/promise/:file" }];
  },
  // The public read-only API (/api/v1, M7): open to any site for GET. Route handlers set the same headers; this covers 404s and HEAD.
  async headers() {
    const cors = [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Access-Control-Allow-Methods", value: "GET, HEAD, OPTIONS" },
    ];
    return [
      { source: "/api/v1", headers: cors },
      { source: "/api/v1/:path*", headers: cors },
    ];
  },
};

export default config;
