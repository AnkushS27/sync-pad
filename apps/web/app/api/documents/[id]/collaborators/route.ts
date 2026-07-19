import { NextResponse } from "next/server";
import { withRLS } from "@syncpad/db";
import { InviteCollaboratorInput, RoleSchema } from "@syncpad/shared";
import { requireUser, assertRole, UnauthorizedError, ForbiddenError } from "@/lib/permissions";
import { mutationRateLimit } from "@/lib/request-guard";
import { z } from "zod";

const UpdateCollaboratorInput = z.object({
  userId: z.string(),
  role: RoleSchema,
});

const RemoveCollaboratorInput = z.object({
  userId: z.string(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: documentId } = await params;
    const user = await requireUser();
    const userId = user.id!;

    const limited = mutationRateLimit(req, userId);
    if (limited) return limited;

    // Assert that the active user is OWNER of the document
    await assertRole(userId, documentId, "OWNER");

    const json = await req.json().catch(() => ({}));
    const parseResult = InviteCollaboratorInput.safeParse(json);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const { email, role } = parseResult.data;

    const result = await withRLS(userId, async (tx) => {
      // Find the user to invite
      const invitee = await tx.user.findUnique({
        where: { email },
      });

      if (!invitee) {
        return { status: 404 as const, error: "User with this email not found" };
      }

      // Check if the user is the document owner
      const doc = await tx.document.findUnique({
        where: { id: documentId },
        select: { ownerId: true },
      });

      if (!doc) {
        return { status: 404 as const, error: "Document not found" };
      }

      if (doc.ownerId === invitee.id) {
        return { status: 400 as const, error: "You cannot add the owner as a collaborator" };
      }

      // Upsert collaborator
      const collaboration = await tx.documentCollaborator.upsert({
        where: {
          documentId_userId: {
            documentId,
            userId: invitee.id,
          },
        },
        create: {
          documentId,
          userId: invitee.id,
          role,
        },
        update: {
          role,
        },
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return { status: 201 as const, data: collaboration };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("POST /api/documents/[id]/collaborators failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: documentId } = await params;
    const user = await requireUser();
    const userId = user.id!;

    const limited = mutationRateLimit(req, userId);
    if (limited) return limited;

    // Assert that the active user is OWNER of the document
    await assertRole(userId, documentId, "OWNER");

    const json = await req.json().catch(() => ({}));
    const parseResult = UpdateCollaboratorInput.safeParse(json);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const { userId: targetUserId, role } = parseResult.data;

    const result = await withRLS(userId, async (tx) => {
      // Check if updating the document owner itself
      const doc = await tx.document.findUnique({
        where: { id: documentId },
        select: { ownerId: true },
      });

      if (!doc) {
        return { status: 404 as const, error: "Document not found" };
      }

      if (doc.ownerId === targetUserId) {
        return {
          status: 400 as const,
          error: "Cannot modify owner role through collaborators endpoint",
        };
      }

      const updated = await tx.documentCollaborator.update({
        where: {
          documentId_userId: {
            documentId,
            userId: targetUserId,
          },
        },
        data: {
          role,
        },
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return { status: 200 as const, data: updated };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("PATCH /api/documents/[id]/collaborators failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: documentId } = await params;
    const user = await requireUser();
    const userId = user.id!;

    const limited = mutationRateLimit(req, userId);
    if (limited) return limited;

    // Assert that the active user is OWNER of the document
    await assertRole(userId, documentId, "OWNER");

    // Can receive target userId via query param or json body. We support both.
    const url = new URL(req.url);
    let targetUserId = url.searchParams.get("userId");

    if (!targetUserId) {
      const json = await req.json().catch(() => ({}));
      const parseResult = RemoveCollaboratorInput.safeParse(json);
      if (parseResult.success) {
        targetUserId = parseResult.data.userId;
      }
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const result = await withRLS(userId, async (tx) => {
      // Check if target is the owner
      const doc = await tx.document.findUnique({
        where: { id: documentId },
        select: { ownerId: true },
      });

      if (!doc) {
        return { status: 404 as const, error: "Document not found" };
      }

      if (doc.ownerId === targetUserId) {
        return { status: 400 as const, error: "Cannot remove the owner from collaborators" };
      }

      await tx.documentCollaborator.delete({
        where: {
          documentId_userId: {
            documentId,
            userId: targetUserId!,
          },
        },
      });

      return { status: 204 as const };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("DELETE /api/documents/[id]/collaborators failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
