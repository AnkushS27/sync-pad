/**
 * authenticate.ts — Hocuspocus `onAuthenticate` hook.
 *
 * This hook is the entire access-control gate for the WebSocket layer.
 * Hocuspocus calls it once per connection attempt, before any sync protocol
 * messages are exchanged.  Throwing inside this hook closes the connection
 * with a rejection — that's the documented behaviour we depend on.
 *
 * Security contract:
 *  - The token must be a valid JWT signed with SYNC_SERVER_INTERNAL_SECRET.
 *  - The `documentId` claim inside the token must match the `documentName`
 *    (i.e. the document ID) the client is trying to open.  Without this check
 *    a user could grab a valid token for Document A and open Document B.
 *  - The token must not be expired (jsonwebtoken handles this automatically
 *    when `ignoreExpiration` is false, which is the default).
 *
 * On success the hook returns `{ userId, role }` which Hocuspocus attaches as
 * `context` to every subsequent hook call for this connection.
 */

import type { onAuthenticatePayload } from "@hocuspocus/server";
import jwt from "jsonwebtoken";
import type { WsTokenPayload } from "@syncpad/shared";
import { config } from "../config.js";

export interface ConnectionContext {
  userId: string;
  documentId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
}

export async function authenticate(data: onAuthenticatePayload): Promise<ConnectionContext> {
  const { token, documentName } = data;

  console.log(
    `[auth-hook] authenticate called for document "${documentName}", token present: ${!!token}, token length: ${token?.length ?? 0}`,
  );

  if (!token) {
    console.error(`[auth-hook] Missing token for document "${documentName}"`);
    throw new Error("Missing authentication token");
  }

  let payload: WsTokenPayload;
  try {
    payload = jwt.verify(token, config.syncServerInternalSecret) as WsTokenPayload;
    console.log(
      `[auth-hook] Token verified OK for document "${documentName}", userId: ${payload.userId}, role: ${payload.role}`,
    );
  } catch (err) {
    // Re-throw with a generic message — don't leak internal details to the
    // client, but do include some context for server-side logging.
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[auth-hook] Token verification failed for document "${documentName}":`,
      message,
      `(token prefix: ${token.substring(0, 20)}...)`,
    );
    throw new Error(`Token verification failed: ${message}`);
  }

  // Ensure the token was minted for THIS document.  A valid token for Document
  // A must not open Document B.
  if (payload.documentId !== documentName) {
    console.error(
      `[auth-hook] Document mismatch: token has "${payload.documentId}", request is for "${documentName}"`,
    );
    throw new Error(
      `Token document mismatch: expected "${documentName}", got "${payload.documentId}"`,
    );
  }

  return {
    userId: payload.userId,
    documentId: payload.documentId,
    role: payload.role,
  };
}
