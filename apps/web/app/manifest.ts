/**
 * PWA Web App Manifest — Next.js native manifest route.
 *
 * Using Next.js's MetadataRoute.Manifest approach so the manifest URL
 * (/manifest.webmanifest) is auto-handled by the framework with correct
 * Content-Type headers, no extra route config needed.
 *
 * start_url points to /documents (the dashboard) so launching the installed
 * PWA drops the user directly into their workspace, not the marketing page.
 *
 * Icons: we provide an SVG maskable icon that scales to all required sizes.
 * For production, replace with rasterized PNG icons at 192x192 and 512x512
 * generated from the same artwork — some browsers/OS don't support SVG icons.
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SyncPad — Collaborative Document Editor",
    short_name: "SyncPad",
    description:
      "A local-first, offline-capable collaborative document editor with real-time sync and version history.",
    start_url: "/documents",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#000000",
    theme_color: "#6366f1",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        // 'any' is required by Chrome for home screen / taskbar shortcuts.
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        // 'maskable' lets the OS mask the icon dynamically (rounded square, circle, etc).
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "My Documents",
        short_name: "Documents",
        description: "Open the document dashboard",
        url: "/documents",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
