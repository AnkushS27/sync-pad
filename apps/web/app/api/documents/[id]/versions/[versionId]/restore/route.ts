import { NextResponse } from "next/server";
import * as Y from "yjs";
import { withRLS } from "@syncpad/db";
import { MAX_DOCUMENT_SIZE_BYTES } from "@syncpad/shared";
import { assertRole, ForbiddenError, requireUser, UnauthorizedError } from "@/lib/permissions";
import { mutationRateLimit } from "@/lib/request-guard";

function applyVersionAsYjsEdit(currentState: Uint8Array | null, targetSnapshot: Uint8Array) {
  const liveDoc = new Y.Doc();
  if (currentState) {
    Y.applyUpdate(liveDoc, currentState);
  }

  const targetDoc = new Y.Doc();
  Y.applyUpdate(targetDoc, targetSnapshot);

  const liveFragment = liveDoc.getXmlFragment("default");
  const targetFragment = targetDoc.getXmlFragment("default");

  liveDoc.transact(() => {
    if (liveFragment.length > 0) {
      liveFragment.delete(0, liveFragment.length);
    }

    const clonedNodes = targetFragment
      .toArray()
      .filter(
        (node): node is Y.XmlElement | Y.XmlText =>
          node instanceof Y.XmlElement || node instanceof Y.XmlText,
      )
      .map((node) => node.clone() as Y.XmlElement | Y.XmlText);

    if (clonedNodes.length > 0) {
      liveFragment.insert(0, clonedNodes);
    }
  }, "version-restore");

  return {
    state: Buffer.from(Y.encodeStateAsUpdate(liveDoc)),
    stateVector: Buffer.from(Y.encodeStateVector(liveDoc)),
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const { id: documentId, versionId } = await params;
    const user = await requireUser();
    const userId = user.id!;

    const limited = mutationRateLimit(req, userId);
    if (limited) return limited;

    await assertRole(userId, documentId, "EDITOR");

    const restored = await withRLS(userId, async (tx) => {
      const [doc, version] = await Promise.all([
        tx.document.findUnique({
          where: { id: documentId },
          select: { docState: true },
        }),
        tx.documentVersion.findFirst({
          where: { id: versionId, documentId },
          select: { id: true, label: true, snapshot: true },
        }),
      ]);

      if (!doc) {
        return { status: 404 as const, error: "Document not found" };
      }
      if (!version) {
        return { status: 404 as const, error: "Version not found" };
      }

      const { state, stateVector } = applyVersionAsYjsEdit(
        doc.docState ? Buffer.from(doc.docState) : null,
        Buffer.from(version.snapshot),
      );

      if (state.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
        return { status: 413 as const, error: "Restored document exceeds size limit" };
      }

      await tx.document.update({
        where: { id: documentId },
        data: {
          docState: state,
          stateSizeBytes: state.byteLength,
          lastSyncedAt: new Date(),
        },
      });

      const restoreVersion = await tx.documentVersion.create({
        data: {
          documentId,
          label: `Restore: ${version.label ?? version.id}`,
          snapshot: state,
          stateVector,
          sizeBytes: state.byteLength,
          createdById: userId,
          isAutoSave: false,
        },
        select: {
          id: true,
          label: true,
          isAutoSave: true,
          createdAt: true,
        },
      });

      await tx.syncAuditLog.create({
        data: {
          documentId,
          userId,
          eventType: "restore",
          payloadSizeBytes: state.byteLength,
          reason: `Restored from version ${version.id}`,
        },
      });

      return { status: 200 as const, version: restoreVersion };
    });

    if ("error" in restored) {
      return NextResponse.json({ error: restored.error }, { status: restored.status });
    }

    // Securely unload the document on the sync-server so that active editors reload the restored state.
    try {
      const syncServerInternalUrl = process.env.SYNC_SERVER_INTERNAL_URL || "http://localhost:1234";
      const unloadRes = await fetch(`${syncServerInternalUrl}/api/documents/${documentId}/unload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SYNC_SERVER_INTERNAL_SECRET || ""}`,
        },
      });
      if (!unloadRes.ok) {
        console.warn(
          `[RestoreRoute] Failed to unload document ${documentId} on sync-server: HTTP ${unloadRes.status}`,
        );
      } else {
        console.log(`[RestoreRoute] Unloaded document ${documentId} on sync-server successfully`);
      }
    } catch (err) {
      console.warn(
        `[RestoreRoute] Could not contact sync-server to unload document ${documentId}:`,
        err,
      );
    }

    return NextResponse.json(restored.version);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("POST /api/documents/[id]/versions/[versionId]/restore failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
