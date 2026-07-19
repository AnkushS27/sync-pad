import { NextResponse } from "next/server";
import { prisma } from "@syncpad/db";
import { CreateDocumentInput } from "@syncpad/shared";
import { requireUser, UnauthorizedError } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    const userId = user.id!;

    const documents = await prisma.document.findMany({
      where: {
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
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
      orderBy: {
        updatedAt: "desc",
      },
    });

    return NextResponse.json(documents);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/documents failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const userId = user.id!;

    const json = await req.json().catch(() => ({}));
    const parseResult = CreateDocumentInput.safeParse(json);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const doc = await prisma.document.create({
      data: {
        title: parseResult.data.title,
        ownerId: userId,
      },
      select: {
        id: true,
        title: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/documents failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
