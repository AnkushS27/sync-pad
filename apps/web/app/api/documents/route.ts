import { NextResponse } from "next/server";
import { withRLS } from "@syncpad/db";
import { CreateDocumentInput } from "@syncpad/shared";
import { requireUser, UnauthorizedError } from "@/lib/permissions";
import { mutationRateLimit, readJsonWithLimit } from "@/lib/request-guard";

export async function GET() {
  try {
    const user = await requireUser();
    const userId = user.id!;

    const documents = await withRLS(userId, (tx) =>
      tx.document.findMany({
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
      }),
    );

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

    const limited = mutationRateLimit(req, userId);
    if (limited) return limited;

    const json = await readJsonWithLimit(req);
    if (!json.ok) return json.response;

    const parseResult = CreateDocumentInput.safeParse(json.data);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const doc = await withRLS(userId, (tx) =>
      tx.document.create({
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
      }),
    );

    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/documents failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
