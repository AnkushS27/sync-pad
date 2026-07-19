import { NextResponse } from "next/server";
import { prisma } from "@syncpad/db";
import { InviteCollaboratorInput, RoleSchema } from "@syncpad/shared";
import { requireUser, assertRole, UnauthorizedError, ForbiddenError } from "@/lib/permissions";
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

    // Find the user to invite
    const invitee = await prisma.user.findUnique({
      where: { email },
    });

    if (!invitee) {
      return NextResponse.json({ error: "User with this email not found" }, { status: 404 });
    }

    // Check if the user is the document owner
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { ownerId: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.ownerId === invitee.id) {
      return NextResponse.json(
        { error: "You cannot add the owner as a collaborator" },
        { status: 400 },
      );
    }

    // Upsert collaborator
    const collaboration = await prisma.documentCollaborator.upsert({
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

    return NextResponse.json(collaboration, { status: 201 });
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

    // Check if updating the document owner itself
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { ownerId: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.ownerId === targetUserId) {
      return NextResponse.json(
        { error: "Cannot modify owner role through collaborators endpoint" },
        { status: 400 },
      );
    }

    const updated = await prisma.documentCollaborator.update({
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

    return NextResponse.json(updated);
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

    // Check if target is the owner
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { ownerId: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.ownerId === targetUserId) {
      return NextResponse.json(
        { error: "Cannot remove the owner from collaborators" },
        { status: 400 },
      );
    }

    await prisma.documentCollaborator.delete({
      where: {
        documentId_userId: {
          documentId,
          userId: targetUserId,
        },
      },
    });

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
