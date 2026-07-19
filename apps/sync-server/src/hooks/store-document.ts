/**
 * store-document.ts — Hocuspocus `onStoreDocument` hook.
 *
 * This hook is called on each debounced persistence cycle.  Hocuspocus fires
 * it after `delay` ms of inactivity since the last change, so we're not
 * writing on every keystroke.
 *
 * Responsibilities here (beyond what postgres-store.ts already does):
 *  1. Encode the current Y.Doc state (via `Y.encodeStateAsUpdate`).
 *  2. Call `storeDocument()` — which enforces the size ceiling and writes to
 *     Postgres.
 *  3. Write a `SyncAuditLog` row for `update_applied` — sampled to every
 *     store cycle, not every single update event.
 *
 * Auto-snapshot logic (Phase 8 responsibility, not Phase 6):
 *  The implementation plan calls for auto-snapshot writes inside this hook
 *  on a coarse interval.  That logic is intentionally NOT implemented here
 *  yet — it's a Phase 8 concern and will be added then.  The structure is
 *  already clean enough to receive it.
 */

import type { onStoreDocumentPayload } from "@hocuspocus/server";
import * as Y from "yjs";
import { storeDocument } from "../persistence/postgres-store.js";
import { writeAuditLog } from "../security/audit-log.js";
import type { ConnectionContext } from "./authenticate.js";

export async function onStoreDocument(data: onStoreDocumentPayload): Promise<void> {
  const { documentName, document, context } = data;

  // context is set by onAuthenticate; cast it here.
  const ctx = context as Partial<ConnectionContext> | undefined;
  const userId = ctx?.userId ?? null;

  // Encode the full current state.
  const state = Y.encodeStateAsUpdate(document);

  await storeDocument({ documentName, state, context });

  // Audit log: one row per store cycle (debounced), not per keystroke.
  writeAuditLog({
    documentId: documentName,
    userId,
    eventType: "update_applied",
    payloadSizeBytes: state.byteLength,
  });
}
