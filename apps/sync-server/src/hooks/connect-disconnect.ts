/**
 * connect-disconnect.ts — Hocuspocus `onConnect` / `onDisconnect` hooks.
 *
 * These hooks handle two concerns:
 *
 *  1. **Audit logging** — every connect/disconnect produces a `SyncAuditLog`
 *     row so there's a full evidence trail of who accessed which document and
 *     when.
 *
 *  2. **Pre-auth connection guard** — `onConnect` fires before
 *     `onAuthenticate`.  We don't have `userId`/`role` yet at this point, so
 *     we don't log to the audit table here (no `documentId` either — the
 *     document isn't resolved until authentication succeeds).  We could add
 *     IP-level rate limiting here in a future pass; for now it's a clean
 *     no-op that documents the hook exists and where to extend it.
 *
 * Note: `onDisconnect` receives the full context (set by `onAuthenticate`),
 * so we do have `userId` there.
 */

import type { onConnectPayload, onDisconnectPayload } from "@hocuspocus/server";
import { writeAuditLog } from "../security/audit-log.js";
import type { ConnectionContext } from "./authenticate.js";

/**
 * Called before `onAuthenticate`.  At this point we have an IP address and
 * a raw socket but no document ID or user identity yet.
 *
 * Future extension point: per-IP connection rate limiting.
 */
export async function onConnect(_data: onConnectPayload): Promise<void> {
  // No-op for now.  Authentication happens in authenticate.ts.
}

/**
 * Called after the connection is fully closed, whether it was authenticated
 * or not.  `context` will be the value returned by `onAuthenticate`; if
 * authentication never succeeded it will be `undefined`.
 */
export async function onDisconnect(data: onDisconnectPayload): Promise<void> {
  const { documentName, context } = data;

  const ctx = context as Partial<ConnectionContext> | undefined;
  const userId = ctx?.userId ?? null;

  // Only write an audit row if authentication previously succeeded (i.e. we
  // have a documentId in context).  Pre-auth disconnects don't have a
  // document to log against.
  if (documentName && userId) {
    writeAuditLog({
      documentId: documentName,
      userId,
      eventType: "disconnect",
    });
  }
}

/**
 * Called after authentication succeeds and the client is fully set up.
 * This is where we write the `connect` audit log entry because at this point
 * we have a verified userId and documentId.
 */
export async function onAuthenticated(documentName: string, ctx: ConnectionContext): Promise<void> {
  writeAuditLog({
    documentId: documentName,
    userId: ctx.userId,
    eventType: "connect",
  });
}
