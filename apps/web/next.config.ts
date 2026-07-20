/**
 * next.config.ts
 *
 * Wrapped with @serwist/next to generate the service worker and inject the
 * precache manifest at build time.
 *
 * IMPORTANT: Serwist's precache-manifest injection is a Webpack plugin.
 * During local `dev` (Turbopack), the SW is disabled entirely (disable: true
 * when NODE_ENV === "development") so Turbopack's dev server is unaffected.
 * The production `build` script in package.json passes `--no-turbopack` to
 * force Webpack, which is required for the SW to be generated correctly.
 *
 * PWA testing note (documented per implementation plan §5.6):
 *   - Service workers only activate on HTTPS or localhost.
 *   - To test: `pnpm --filter web build && pnpm --filter web start`
 *     then open http://localhost:3000 in a browser with devtools.
 */
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  // Source: our hand-written SW file inside the app/ directory.
  swSrc: "app/sw.ts",
  // Destination: served as a static file at /sw.js.
  swDest: "public/sw.js",
  // Disable during development — Serwist needs Webpack to inject __SW_MANIFEST,
  // and the dev server runs Turbopack. A service worker running during dev also
  // interferes with hot-reload, so this is doubly correct.
  disable: process.env.NODE_ENV === "development",
  // Exclude the generated sw.js and its source map from Next.js's own asset
  // handling — they're served as plain static files, not framework routes.
  additionalPrecacheEntries: [],
});

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["@prisma/client", "@syncpad/db"],
  transpilePackages: ["@syncpad/shared"],
  outputFileTracingIncludes: {
    "**/*": [
      "../../node_modules/.prisma/client/**/*",
      "../../node_modules/@prisma/client/**/*",
      "./.prisma/client/**/*",
    ],
  },
  turbopack: {},
};

export default withSerwist(nextConfig);
