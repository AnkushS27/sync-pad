/**
 * SyncPad Service Worker — powered by Serwist
 *
 * Strategy rationale:
 *  - /api/** → NetworkOnly (never serve stale API data; offline = real-time features unavailable,
 *    not silently stale). The Dexie layer handles offline document-list fallback at the app level.
 *  - _next/static/** → CacheFirst (immutable build hashes; safe to cache forever).
 *  - Everything else → falls through to Serwist's defaultCache (StaleWhileRevalidate for pages,
 *    CacheFirst for static assets, NetworkFirst for navigation).
 *
 * PWA testing note: Service workers only activate on HTTPS or localhost.
 * Run `pnpm --filter web build && pnpm --filter web start` and open http://localhost:3000
 * to test the installed PWA shell in production mode.
 *
 * Disabled in development (NODE_ENV === "development") via next.config.ts — see withSerwistInit.
 */
import { defaultCache } from "@serwist/next/worker";
import {
  Serwist,
  NetworkOnly,
  CacheFirst,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

// Extend WorkerGlobalScope to include the injected precache manifest
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // __SW_MANIFEST is injected at build time by @serwist/next via the Webpack plugin
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,

  // Immediately take control of all open clients — no waiting for the
  // old SW to be discarded across all tabs.
  skipWaiting: true,
  clientsClaim: true,

  // Disable Navigation Preload as we are using default Serwist caching strategies
  // and do not manually intercept fetch events to consume preload responses.
  navigationPreload: false,

  runtimeCaching: [
    // ── API routes — always network, never cached ─────────────────────────
    // Serving stale JSON here could silently mislead the UI (e.g. wrong
    // collaborator list or wrong document metadata). Offline fallback is
    // handled at the application layer via Dexie, not the service worker.
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },

    // ── Next.js static chunk assets — immutable, cache forever ────────────
    // Chunks are content-addressed (hash in filename), so CacheFirst is safe.
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "next-static-assets",
        plugins: [],
      }),
    },

    // ── All other routes (pages, fonts, images…) ─────────────────────────
    // Delegate to @serwist/next's curated default strategy set.
    ...defaultCache,
  ],
});

serwist.addEventListeners();
