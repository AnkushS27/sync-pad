/**
 * payload-limits.ts — Transport-layer payload size enforcement.
 *
 * The WebSocket server is configured with a hard `maxPayload` so that any
 * single frame exceeding `MAX_WS_MESSAGE_BYTES` is rejected by the socket
 * library *before* any Yjs decoding is attempted.
 *
 * "Reject before allocate, not after" — this is the OOM guard.  If we let the
 * frame arrive and then checked its size, we'd have already allocated memory
 * for it.  Setting `maxPayload` on the underlying `ws.WebSocketServer` options
 * means the connection is dropped at the transport layer, with zero Yjs code
 * ever running.
 *
 * This module exports the options object that `apps/sync-server/src/index.ts`
 * passes to the WebSocketServer constructor via Hocuspocus's `server` option.
 */

import type { ServerOptions } from "ws";
import { config } from "../config.js";

/**
 * WebSocket server options that enforce the frame-size ceiling.
 * Pass this as `websocketOptions` to `Server.configure(...)`.
 */
export const wsServerOptions: Partial<ServerOptions> = {
  /**
   * Hard ceiling on incoming frame size (bytes).  The `ws` library rejects
   * frames exceeding this at the transport layer — before any application code
   * runs — and sends a 1009 (Message Too Big) close frame.
   */
  maxPayload: config.maxWsMessageBytes,
};
