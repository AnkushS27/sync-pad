import { NextResponse } from "next/server";
import * as Y from "yjs";
import { prisma, withRLS } from "@syncpad/db";
import { CreateVersionInput } from "@syncpad/shared";
import { assertRole, ForbiddenError, requireUser, UnauthorizedError } from "@/lib/permissions";
import { mutationRateLimit, readJsonWithLimit } from "@/lib/request-guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: documentId } = await params;
    const user = await requireUser();
    const userId = user.id!;

    await assertRole(userId, documentId, "VIEWER");

    const versions = await withRLS(userId, (tx) =>
      tx.documentVersion.findMany({
        where: { documentId },
        select: {
          id: true,
          label: true,
          sizeBytes: true,
          isAutoSave: true,
          createdAt: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    );

    return NextResponse.json(versions);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/documents/[id]/versions failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: documentId } = await params;
    const user = await requireUser();
    const userId = user.id!;

    const limited = mutationRateLimit(req, userId);
    if (limited) return limited;

    await assertRole(userId, documentId, "EDITOR");

    const json = await readJsonWithLimit(req);
    if (!json.ok) return json.response;

    const parseResult = CreateVersionInput.safeParse(json.data);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const version = await withRLS(userId, async (tx) => {
      const doc = await tx.document.findUnique({
        where: { id: documentId },
        select: { docState: true },
      });

      if (!doc?.docState) {
        throw new Error("Document has no synced state to snapshot yet");
      }

      const snapshot = Buffer.from(doc.docState);
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, snapshot);
      const stateVector = Buffer.from(Y.encodeStateVector(ydoc));

      return tx.documentVersion.create({
        data: {
          documentId,
          label: parseResult.data.label ?? "Manual save",
          snapshot,
          stateVector,
          sizeBytes: snapshot.byteLength,
          createdById: userId,
          isAutoSave: false,
        },
        select: {
          id: true,
          label: true,
          sizeBytes: true,
          isAutoSave: true,
          createdAt: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });

    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message.includes("no synced state")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("POST /api/documents/[id]/versions failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
