/**
 * audit-log.ts — Thin helpers for writing to the `SyncAuditLog` table.
 *
 * Keeping audit writes here (rather than inline in each hook) means:
 *  - The schema for each event type is in one place, easy to audit and extend.
 *  - Each hook stays focused on its own logic.
 *  - If we ever need to batch / debounce / async-queue audit writes, we do it
 *    here without touching the hooks.
 *
 * Note: `userId` is optional in the schema because pre-authentication events
 * (e.g. a connection that fails `onAuthenticate`) don't yet have a user.
 */

import { prisma } from "@syncpad/db";

export type AuditEventType =
  "connect" | "disconnect" | "update_applied" | "update_rejected" | "restore";

interface BaseAuditEntry {
  documentId: string;
  userId?: string | null;
  eventType: AuditEventType;
  payloadSizeBytes?: number | null;
  reason?: string | null;
}

/**
 * Fire-and-forget audit log write.  We intentionally don't `await` this in
 * high-frequency paths (e.g. every update cycle) to avoid adding latency to
 * the hot path.  The DB write is non-critical for correctness.
 *
 * If the write fails (e.g. DB temporarily unavailable) we log to stderr but
 * do not propagate the error — an audit write failure must never take down
 * the sync connection.
 */
export function writeAuditLog(entry: BaseAuditEntry): void {
  prisma.syncAuditLog
    .create({
      data: {
        documentId: entry.documentId,
        userId: entry.userId ?? null,
        eventType: entry.eventType,
        payloadSizeBytes: entry.payloadSizeBytes ?? null,
        reason: entry.reason ?? null,
      },
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[audit-log] Failed to write audit entry: ${message}`);
    });
}

/**
 * Awaitable version for cases where we need to ensure the log entry is
 * persisted before proceeding (e.g. a restore operation that is itself
 * recorded as a version).
 */
export async function writeAuditLogAsync(entry: BaseAuditEntry): Promise<void> {
  await prisma.syncAuditLog.create({
    data: {
      documentId: entry.documentId,
      userId: entry.userId ?? null,
      eventType: entry.eventType,
      payloadSizeBytes: entry.payloadSizeBytes ?? null,
      reason: entry.reason ?? null,
    },
  });
}
