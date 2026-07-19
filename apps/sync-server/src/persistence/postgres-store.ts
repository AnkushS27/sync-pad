/**
 * postgres-store.ts — Persistence adapter consumed via
 * `@hocuspocus/extension-database`.
 *
 * Hocuspocus's Database extension calls `fetch` when a document is first
 * loaded (to hydrate the in-memory Y.Doc from Postgres) and `store` on each
 * debounced save cycle (to flush the in-memory state back to Postgres).
 *
 * We use `Document.docState` (a `Bytes`/`bytea` column) for the compacted
 * Yjs state.  This column is deliberately excluded from list queries — it is
 * only read when a specific document is opened by at least one client.
 *
 * The size guard in `store` is the persistence layer's last line of defence
 * against unbounded document growth.  An over-budget document is not written
 * but is logged to `SyncAuditLog` so the problem surfaces rather than growing
 * silently.
 */

import { prisma } from "@syncpad/db";
import { config } from "../config.js";

// ─── Types expected by @hocuspocus/extension-database ────────────────────────

export interface FetchPayload {
  documentName: string;
  // context is typed as unknown in older Hocuspocus versions
  context: unknown;
}

export interface StorePayload {
  documentName: string;
  state: Uint8Array;
  // context is typed as unknown in older Hocuspocus versions
  context: unknown;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Returns the stored CRDT state for `documentName`, or `null` if no row
 * exists yet (Hocuspocus will start a fresh, empty Y.Doc in that case).
 *
 * We select only `docState` + `id` — never the full row — to keep the query
 * lean and consistent with the "no blob in list queries" principle.
 */
export async function fetchDocument(payload: FetchPayload): Promise<Uint8Array | null> {
  const { documentName } = payload;

  const doc = await prisma.document.findUnique({
    where: { id: documentName },
    select: { id: true, docState: true },
  });

  if (!doc || !doc.docState) {
    // No persisted state yet — caller starts with a fresh doc.
    return null;
  }

  return doc.docState;
}

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Writes the compacted Yjs state to `Document.docState`.
 *
 * Size guard: if the encoded state exceeds `config.maxDocumentSizeBytes`, we
 * skip the write and insert a `SyncAuditLog` row with `eventType:
 * "update_rejected"`.  The document continues to live in memory server-side;
 * this only prevents the over-budget state from being persisted, which forces
 * the size problem to surface (via the log) rather than growing forever.
 *
 * DECISION: We use `update(Document)` rather than an upsert because the
 * document row is always created by apps/web before a WS connection is
 * established.  If the row is somehow missing the update will throw, which is
 * the correct behaviour — it signals a bug in the token-minting flow, not a
 * normal operating condition.
 */
export async function storeDocument(payload: StorePayload): Promise<void> {
  const { documentName, state } = payload;
  const sizeBytes = state.byteLength;

  if (sizeBytes > config.maxDocumentSizeBytes) {
    // Over budget: log and skip persistence.
    await prisma.syncAuditLog.create({
      data: {
        documentId: documentName,
        eventType: "update_rejected",
        payloadSizeBytes: sizeBytes,
        reason: `Document state exceeds size ceiling (${sizeBytes} > ${config.maxDocumentSizeBytes} bytes)`,
      },
    });
    return;
  }

  await prisma.document.update({
    where: { id: documentName },
    data: {
      docState: Buffer.from(state),
      stateSizeBytes: sizeBytes,
      lastSyncedAt: new Date(),
    },
  });
}
