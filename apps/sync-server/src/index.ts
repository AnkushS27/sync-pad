/**
 * index.ts — Hocuspocus WebSocket server bootstrap.
 *
 * This is the entry point for `apps/sync-server`.  It wires together all the
 * hooks and extensions into a single Hocuspocus server instance and starts
 * listening.
 *
 * Architecture notes (from the Implementation Plan, Phase 6):
 *  - Authentication gate:      hooks/authenticate.ts  (onAuthenticate)
 *  - Postgres persistence:     persistence/postgres-store.ts (via Database ext)
 *  - VIEWER read-only guard:   hooks/change.ts  (onChange)
 *  - Connect/disconnect audit: hooks/connect-disconnect.ts
 *  - Frame-size OOM guard:     security/payload-limits.ts (wsServerOptions)
 *  - Per-connection throttle:  @hocuspocus/extension-throttle
 *  - Structured logging:       @hocuspocus/extension-logger
 */

import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { Logger } from "@hocuspocus/extension-logger";
import { Throttle } from "@hocuspocus/extension-throttle";
import * as Y from "yjs";
import { config } from "./config.js";
import { authenticate, type ConnectionContext } from "./hooks/authenticate.js";
import { onChange } from "./hooks/change.js";
import { onConnect, onDisconnect, onAuthenticated } from "./hooks/connect-disconnect.js";
import { onLoadDocument } from "./hooks/load-document.js";
import { fetchDocument, storeDocument } from "./persistence/postgres-store.js";
import { wsServerOptions } from "./security/payload-limits.js";
import { writeAuditLog } from "./security/audit-log.js";

const server = Server.configure({
  // ─── Transport ──────────────────────────────────────────────────────────────
  port: config.port,

  // ─── Extensions ─────────────────────────────────────────────────────────────
  extensions: [
    // Structured console logging — silenced in test environments.
    new Logger(config.nodeEnv === "test" ? { log: () => undefined } : {}),

    // Database extension: wires fetch/store to our Postgres-backed functions.
    // Hocuspocus calls `fetch` when a document is first loaded and `store` on
    // each debounced save cycle.
    new Database({
      fetch: async (data) =>
        fetchDocument({
          documentName: data.documentName,
          context: data.context,
        }),
      store: async (data) =>
        storeDocument({
          documentName: data.documentName,
          state: data.state,
          context: data.context,
        }),
    }),

    // Per-connection rate limiting.
    // Limit to 60 connection attempts per 60 seconds per IP.
    // new Throttle({
    //   throttle: 60,
    //   consideredSeconds: 60,
    // }),
  ],

  // ─── Hooks ──────────────────────────────────────────────────────────────────

  /** Access-control gate.  Throwing here rejects the connection entirely. */
  async onAuthenticate(data) {
    const ctx = await authenticate(data);

    // Write a connect audit entry now that we have a verified user identity.
    await onAuthenticated(data.documentName, ctx);

    // The returned value is attached as `context` to every subsequent hook.
    return ctx;
  },

  /** Pre-auth connection hook — future extension point for IP rate limiting. */
  async onConnect(data) {
    return onConnect(data);
  },

  /** Post-auth document load — logs in dev, extension point for future use. */
  async onLoadDocument(data) {
    return onLoadDocument(data);
  },

  /**
   * Called on every document change.
   *
   * Primary responsibility: reject updates from VIEWER connections.
   * Throwing here prevents the update from being forwarded or persisted.
   */
  async onChange(data) {
    return onChange(data);
  },

  /**
   * Called on each debounced store cycle (after the Database extension has
   * already written to Postgres).  We use this hook solely for audit logging —
   * the actual DB write is the Database extension's responsibility.
   */
  async onStoreDocument(data) {
    const ctx = data.context as Partial<ConnectionContext> | undefined;
    const state = Y.encodeStateAsUpdate(data.document);

    // Fire-and-forget: audit write latency must not block sync.
    writeAuditLog({
      documentId: data.documentName,
      userId: ctx?.userId ?? null,
      eventType: "update_applied",
      payloadSizeBytes: state.byteLength,
    });
  },

  /** Called after a client disconnects. */
  async onDisconnect(data) {
    return onDisconnect(data);
  },
});

// ─── Start ───────────────────────────────────────────────────────────────────

// Hocuspocus expects websocketOptions (like maxPayload) in the listen() call,
// since it is forwarded directly to the underlying ws.WebSocketServer constructor.
server.listen(config.port, null, wsServerOptions).then(() => {
  console.log(`[sync-server] Hocuspocus WebSocket server running on port ${config.port}`);
  console.log(`[sync-server] Environment: ${config.nodeEnv}`);
  console.log(`[sync-server] Max document size: ${config.maxDocumentSizeBytes} bytes`);
  console.log(`[sync-server] Max WS frame size: ${config.maxWsMessageBytes} bytes`);
});
