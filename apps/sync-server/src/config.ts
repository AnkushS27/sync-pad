/**
 * config.ts — Centralised environment configuration for apps/sync-server.
 *
 * All process.env reads happen here so the rest of the codebase imports typed
 * constants rather than touching process.env directly.  Missing required vars
 * throw at startup (fail-fast) rather than surfacing as cryptic runtime errors
 * minutes later.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[sync-server] Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  /** Port the Hocuspocus WebSocket server listens on. */
  port: Number(optionalEnv("PORT", "1234")),

  /** HMAC-SHA256 secret used to verify short-lived tokens minted by apps/web. */
  syncServerInternalSecret: requireEnv("SYNC_SERVER_INTERNAL_SECRET"),

  /** Maximum encoded Yjs state (bytes) that will be written to Postgres. */
  maxDocumentSizeBytes: Number(optionalEnv("MAX_DOCUMENT_SIZE_BYTES", "5000000")),

  /** Maximum WebSocket frame size (bytes) accepted at the transport layer. */
  maxWsMessageBytes: Number(optionalEnv("MAX_WS_MESSAGE_BYTES", "1000000")),

  nodeEnv: optionalEnv("NODE_ENV", "development"),
} as const;
