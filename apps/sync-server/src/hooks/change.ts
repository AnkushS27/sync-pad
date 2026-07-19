/**
 * change.ts — Hocuspocus `onChange` hook.
 *
 * Called on every document change that arrives at the server.  This hook is
 * responsible for two things:
 *
 *  1. **VIEWER read-only enforcement at the server layer.**
 *     Even though the client UI hides the editor for VIEWERs, we cannot trust
 *     the client.  A malicious client could forge a document update and send it
 *     over the WebSocket.  We reject any update whose origin is a connection
 *     whose `context.role === "VIEWER"`.
 *
 *     Hocuspocus v2 exposes `transactionOrigin` on the change payload, which
 *     is set by the originating connection.  We check it here.
 *
 *     DECISION: Hocuspocus's current API doesn't have a first-class "mark
 *     connection as read-only" flag, so we implement the read-only constraint
 *     by throwing in `onChange` when the context role is VIEWER.  Throwing
 *     here causes Hocuspocus to reject the update without forwarding it to
 *     other clients or persisting it, which is exactly the desired behaviour.
 *
 *  2. **Audit logging** — sampled, not per-keystroke.  We log inside
 *     `onStoreDocument` (per persistence cycle) rather than here (per change
 *     event) to avoid writing a row for every single keystroke across all
 *     connected clients.
 */

import type { onChangePayload } from "@hocuspocus/server";
import { writeAuditLog } from "../security/audit-log.js";
import type { ConnectionContext } from "./authenticate.js";

export async function onChange(data: onChangePayload): Promise<void> {
  const { documentName, context } = data;

  const ctx = context as Partial<ConnectionContext> | undefined;
  const role = ctx?.role;
  const userId = ctx?.userId ?? null;

  // Enforce read-only for VIEWERs.  Any incoming update from a VIEWER
  // connection is rejected here.  Hocuspocus does NOT forward updates to other
  // clients when this hook throws.
  if (role === "VIEWER") {
    writeAuditLog({
      documentId: documentName,
      userId,
      eventType: "update_rejected",
      reason: "VIEWER role attempted to send a document update",
    });

    // Throwing here is the Hocuspocus-documented way to reject a change.
    throw new Error("VIEWER connections are read-only");
  }
}
