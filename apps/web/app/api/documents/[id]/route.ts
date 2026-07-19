import { NextResponse } from "next/server";
import { withRLS } from "@syncpad/db";
import { UpdateDocumentInput } from "@syncpad/shared";
import { requireUser, assertRole, UnauthorizedError, ForbiddenError } from "@/lib/permissions";
import { mutationRateLimit, readJsonWithLimit } from "@/lib/request-guard";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const userId = user.id!;

    // Assert VIEWER role (assertRole throws if user doesn't have access)
    await assertRole(userId, id, "VIEWER");

    const doc = await withRLS(userId, (tx) =>
      tx.document.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          ownerId: true,
          createdAt: true,
          updatedAt: true,
          lastSyncedAt: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          collaborators: {
            select: {
              userId: true,
              role: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    );

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json(doc);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/documents/[id] failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const userId = user.id!;

    const limited = mutationRateLimit(req, userId);
    if (limited) return limited;

    // Assert EDITOR role
    await assertRole(userId, id, "EDITOR");

    const json = await readJsonWithLimit(req);
    if (!json.ok) return json.response;

    const parseResult = UpdateDocumentInput.safeParse(json.data);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const updatedDoc = await withRLS(userId, (tx) =>
      tx.document.update({
        where: { id },
        data: {
          title: parseResult.data.title,
        },
        select: {
          id: true,
          title: true,
          ownerId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );

    return NextResponse.json(updatedDoc);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("PATCH /api/documents/[id] failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const userId = user.id!;

    const limited = mutationRateLimit(req, userId);
    if (limited) return limited;

    // Assert OWNER role
    await assertRole(userId, id, "OWNER");

    await withRLS(userId, (tx) => tx.document.delete({ where: { id } }));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("DELETE /api/documents/[id] failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
