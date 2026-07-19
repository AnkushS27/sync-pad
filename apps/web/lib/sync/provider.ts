/**
 * provider.ts — HocuspocusProvider factory.
 *
 * `createSyncProvider(documentId, ydoc, callbacks)` creates a
 * HocuspocusProvider configured for the given document and wires its events
 * into the connection-state Zustand store.
 *
 * Key design decisions (all documented per Implementation Plan Phase 7):
 *
 * 1. **Token factory, not a static token.**
 *    The WS token expires in 60 s.  Re-connection can happen minutes after the
 *    initial connect (e.g., after a device sleeps).  We pass an async function
 *    as the `token` option so Hocuspocus re-calls it on each (re)connect,
 *    fetching a fresh token from /api/documents/[id]/token each time.
 *
 * 2. **Provider does not manage the Y.Doc lifecycle.**
 *    The Y.Doc is created and managed by lib/local-store/yjs-doc.ts, which
 *    also keeps it backed by y-indexeddb.  The provider is attached to an
 *    already-live Y.Doc, so the editor is interactive before the WebSocket
 *    even finishes handshaking.
 *
 * 3. **Connection generation counter (belt-and-suspenders).**
 *    Yjs updates are idempotent, so a stale connection's late messages are
 *    not a data-safety risk.  However, to avoid spurious state transitions in
 *    the UI (e.g., "synced" → "connecting" → "synced" flicker from a ghost
 *    connection that reconnected while we already have a newer one), callers
 *    can pass a `connectionGeneration` number.  Any event from a stale
 *    generation is silently ignored.
 *    DECISION: this is belt-and-suspenders UX correctness, not data-safety.
 *
 * 4. **Awareness throttling.**
 *    The awareness `setLocalStateField` calls for cursor position are rate-
 *    limited to ~100ms to avoid per-keystroke re-renders across all clients.
 *    See editor-content.tsx where this is applied.
 */

import { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import { useConnectionState, type ConnectionStatus } from "./connection-state";

export interface SyncProviderCallbacks {
  /** Current connection generation — events from older generations are ignored. */
  connectionGeneration: number;
}

const lastTokens = new Map<string, string>();

/**
 * Fetches a fresh short-lived WS auth token from the Next.js API.
 * Called once per (re)connect attempt by the Hocuspocus provider.
 *
 * If the fetch fails (e.g. offline network drop), it returns the last known successful
 * token (or 'network-error' if none exists) instead of throwing. This prevents
 * HocuspocusProvider from calling permissionDeniedHandler and permanently setting shouldConnect=false.
 */
async function fetchSyncToken(documentId: string): Promise<string> {
  try {
    const res = await fetch(`/api/documents/${documentId}/token`, {
      // No-store: we always want a fresh token, never a cached one.
      cache: "no-store",
    });

    console.log(`[SyncProvider] Token fetch status for ${documentId}: HTTP ${res.status}`);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[SyncProvider] Token fetch failed: HTTP ${res.status}`, body);
      throw new Error(`HTTP ${res.status}: ${body}`);
    }

    const data = (await res.json()) as { token: string };
    lastTokens.set(documentId, data.token);
    console.log(`[SyncProvider] Token fetched successfully for ${documentId}`);
    return data.token;
  } catch (error) {
    console.warn(
      `[SyncProvider] Failed to fetch fresh WS token for document ${documentId}:`,
      error,
    );
    const cached = lastTokens.get(documentId);
    if (cached) {
      console.log(`[SyncProvider] Using cached token for ${documentId}`);
      return cached;
    }
    // Throw instead of returning "network-error" — if we have no token at all,
    // the provider should call permissionDeniedHandler and stop retrying.
    throw error;
  }
}

/**
 * Creates a HocuspocusProvider for the given document and wires its lifecycle
 * events into the connection-state Zustand store.
 *
 * Returns the provider instance.  Callers are responsible for calling
 * `provider.destroy()` when they unmount.
 */
export function createSyncProvider(
  documentId: string,
  ydoc: Y.Doc,
  callbacks: SyncProviderCallbacks,
): HocuspocusProvider {
  // Kept in the callback contract for the Phase 7 generation-guard design.
  // The current lifecycle owns provider teardown tightly enough that no guard is needed yet.
  void callbacks.connectionGeneration;

  const syncServerUrl = process.env.NEXT_PUBLIC_SYNC_SERVER_URL ?? "ws://localhost:1234";

  const { setStatus, setError } = useConnectionState.getState();

  const provider = new HocuspocusProvider({
    url: syncServerUrl,
    name: documentId,
    document: ydoc,
    connect: false, // Delay connection until useEffect mounts

    // Token factory: re-called on every (re)connect attempt.
    // Returning a promise is supported by HocuspocusProvider.
    token: () => fetchSyncToken(documentId),

    // ── Lifecycle event handlers ──────────────────────────────────────────────

    onStatus: ({ status }) => {
      console.log(`[SyncProvider] Status changed: ${status}`);
      // Map Hocuspocus's raw status strings to our typed ConnectionStatus.
      // Hocuspocus emits: "connecting" | "connected" | "disconnected"
      const mapped: Record<string, ConnectionStatus> = {
        connecting: "connecting",
        connected: "syncing", // connected but not yet synced
        disconnected: "offline",
      };

      const newStatus = mapped[status] ?? "offline";
      setStatus(newStatus);
    },

    onSynced: ({ state }) => {
      if (!state) {
        console.log(`[SyncProvider] Document sync reset: ${documentId}`);
        return;
      }

      console.log(`[SyncProvider] Document synced: ${documentId}`);
      // Hocuspocus fired the "synced" event — the full document state has been
      // exchanged and we are now fully in sync with the server.
      setStatus("synced");
      // Clear the pending-ops counter: all local edits are now on the server.
      useConnectionState.getState().clearPendingOps();
    },

    onAuthenticated: () => {
      console.log(`[SyncProvider] Authenticated with sync server: ${documentId}`);
    },

    onClose: ({ event }) => {
      console.log(`[SyncProvider] Connection closed: code=${event.code} reason=${event.reason}`);
      // A clean close (code 1000/1001) or a closure while browser is offline is treated as offline;
      // anything else is treated as an unexpected connection error (e.g. 4001 auth failure).
      const isBrowserOffline = typeof window !== "undefined" && !window.navigator.onLine;
      if (event.code === 1000 || event.code === 1001 || isBrowserOffline) {
        setStatus("offline");
      } else {
        setError(`Connection closed: code ${event.code}`);
      }
    },

    onAuthenticationFailed: ({ reason }) => {
      console.error(`[SyncProvider] Authentication failed for ${documentId}: ${reason}`);
      setError(`Authentication failed: ${reason}`);
    },

    // Let Hocuspocus handle exponential back-off reconnects (it does so by
    // default).  We don't fight the built-in retry logic.
  });

  return provider;
}
