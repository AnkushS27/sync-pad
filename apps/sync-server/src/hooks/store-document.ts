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
import { prisma } from "@syncpad/db";
import { AUTO_VERSION_INTERVAL_MS } from "@syncpad/shared";
import { storeDocument } from "../persistence/postgres-store.js";
import { writeAuditLog } from "../security/audit-log.js";
import type { ConnectionContext } from "./authenticate.js";

async function pruneAutoSaves(documentName: string): Promise<void> {
  const autoSaves = await prisma.documentVersion.findMany({
    where: { documentId: documentName, isAutoSave: true },
    orderBy: { createdAt: "desc" },
  });

  const toDelete: string[] = [];
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  const hourlyBuckets = new Set<string>();
  const dailyBuckets = new Set<string>();

  for (const version of autoSaves) {
    const time = version.createdAt.getTime();
    const age = now - time;

    if (age <= oneDayMs) {
      // Keep hourly: group by yyyy-MM-dd-HH
      const bucket = version.createdAt.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
      if (hourlyBuckets.has(bucket)) {
        toDelete.push(version.id);
      } else {
        hourlyBuckets.add(bucket);
      }
    } else {
      // Keep daily: group by yyyy-MM-dd
      const bucket = version.createdAt.toISOString().slice(0, 10); // "YYYY-MM-DD"
      if (dailyBuckets.has(bucket)) {
        toDelete.push(version.id);
      } else {
        dailyBuckets.add(bucket);
      }
    }
  }

  if (toDelete.length > 0) {
    await prisma.documentVersion.deleteMany({
      where: { id: { in: toDelete } },
    });
    console.log(
      `[sync-server] Pruned ${toDelete.length} old auto-save versions for document ${documentName}`,
    );
  }
}

async function saveAutoSnapshot(
  documentName: string,
  document: Y.Doc,
  userId: string | null,
): Promise<void> {
  try {
    const now = new Date();

    // 1. Check when the last auto-save version was created for this document
    const lastAutoSave = await prisma.documentVersion.findFirst({
      where: {
        documentId: documentName,
        isAutoSave: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        createdAt: true,
      },
    });

    if (
      lastAutoSave &&
      now.getTime() - lastAutoSave.createdAt.getTime() < AUTO_VERSION_INTERVAL_MS
    ) {
      // Not enough time has passed since last auto-save
      return;
    }

    // 2. Resolve creator ID. If userId is null (no active context), use document owner.
    let creatorId = userId;
    if (!creatorId) {
      const doc = await prisma.document.findUnique({
        where: { id: documentName },
        select: { ownerId: true },
      });
      creatorId = doc?.ownerId || null;
    }

    if (!creatorId) {
      console.warn(
        `[sync-server] Skipping auto-snapshot for ${documentName}: owner/creator not found`,
      );
      return;
    }

    // 3. Generate snapshot and state vector
    const snapshot = Y.encodeStateAsUpdate(document);
    const stateVector = Y.encodeStateVector(document);

    // 4. Create the auto-saved version
    await prisma.documentVersion.create({
      data: {
        documentId: documentName,
        label: "Auto-save",
        snapshot: Buffer.from(snapshot),
        stateVector: Buffer.from(stateVector),
        sizeBytes: snapshot.byteLength,
        createdById: creatorId,
        isAutoSave: true,
        createdAt: now,
      },
    });

    console.log(`[sync-server] Created auto-save version for document ${documentName}`);

    // 5. Run tiered pruning
    await pruneAutoSaves(documentName);
  } catch (error) {
    console.error(`[sync-server] Failed to create auto-save version for ${documentName}:`, error);
  }
}

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

  // Trigger auto-save asynchronously to avoid blocking the client persistence cycle.
  saveAutoSnapshot(documentName, document, userId);
}
