import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SyncPad — Collaborative Document Editor",
    template: "%s | SyncPad",
  },
  description:
    "A local-first, offline-capable collaborative document editor with real-time sync and version history.",
  applicationName: "SyncPad",
  // Next.js reads app/manifest.ts automatically — no <link rel="manifest"> needed here.
  // metadataBase is required if you add absolute-URL Open Graph images in the future.
  metadataBase: new URL(
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  ),
};

// Viewport export is the Next.js 15+ way to set <meta name="theme-color"> and viewport.
// Do NOT put these in the metadata object — they have their own dedicated export.
export const viewport: Viewport = {
  themeColor: "#6366f1",
  // colorScheme: "dark" signals that we intentionally have a dark UI, letting the
  // browser skip its own dark-mode heuristics and render the correct scrollbar style.
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // maximumScale: 1 would prevent pinch-zoom — avoid this for accessibility.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <Analytics />
      <body className="min-h-full flex flex-col">
        {children}
        {/* PWA install prompt — client component, mounts once at shell level */}
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
