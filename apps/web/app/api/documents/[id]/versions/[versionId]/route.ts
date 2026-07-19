import { NextResponse } from "next/server";
import { withRLS } from "@syncpad/db";
import { assertRole, ForbiddenError, requireUser, UnauthorizedError } from "@/lib/permissions";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const { id: documentId, versionId } = await params;
    const user = await requireUser();
    const userId = user.id!;

    await assertRole(userId, documentId, "VIEWER");

    const version = await withRLS(userId, (tx) =>
      tx.documentVersion.findFirst({
        where: { id: versionId, documentId },
        select: {
          id: true,
          label: true,
          sizeBytes: true,
          isAutoSave: true,
          createdAt: true,
          snapshot: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    );

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...version,
      snapshotBase64: Buffer.from(version.snapshot).toString("base64"),
      snapshot: undefined,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/documents/[id]/versions/[versionId] failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
