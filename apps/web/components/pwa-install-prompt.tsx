"use client";

/**
 * PwaInstallPrompt
 *
 * Listens for the browser's `beforeinstallprompt` event and surfaces a
 * shadcn-styled install banner. The event only fires when:
 *   1. The app is served over HTTPS (or localhost in dev — but note the SW is
 *      disabled in dev mode, so the full PWA install check won't pass until a
 *      production build is running).
 *   2. The app hasn't already been installed.
 *   3. The browser's own heuristics are satisfied (visit threshold, etc.).
 *
 * The prompt is intentionally unobtrusive — shown as a subtle bottom-right
 * toast-style banner, not a modal that blocks content.
 */
import * as React from "react";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

// Extend the standard Event interface for the non-standard beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    // Read dismissal state from localStorage so we don't re-show after user hides it
    const wasDismissed = localStorage.getItem("pwa-install-dismissed") === "1";
    if (wasDismissed) return;

    const handler = (e: Event) => {
      // Prevent the browser's default mini-infobar from appearing
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDeferredPrompt(null);
    setDismissed(true);
    localStorage.setItem("pwa-install-dismissed", "1");
  };

  // Don't render anything if no prompt is available or user dismissed
  if (!deferredPrompt || dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Install SyncPad"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl shadow-black/40 max-w-xs animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      {/* App icon indicator */}
      <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-900/40">
        <Smartphone className="h-5 w-5 text-white" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold text-white leading-tight">Install SyncPad</p>
        <p className="text-xs text-zinc-400 leading-snug">Work offline, anytime.</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          id="pwa-install-btn"
          onClick={handleInstall}
          size="sm"
          className="h-8 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm shadow-indigo-900/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          Install
        </Button>
        <Button
          id="pwa-install-dismiss-btn"
          onClick={handleDismiss}
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          aria-label="Dismiss install prompt"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
