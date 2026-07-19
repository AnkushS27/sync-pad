import { auth } from "@/lib/auth";
import { withRLS } from "@syncpad/db";
import { Role } from "@syncpad/shared";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

const roleValues: Record<Role, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  return session.user;
}

export async function getUserRole(userId: string, documentId: string): Promise<Role | null> {
  return withRLS(userId, async (tx) => {
    const doc = await tx.document.findUnique({
      where: { id: documentId },
      select: { ownerId: true },
    });

    if (!doc) {
      return null;
    }

    if (doc.ownerId === userId) {
      return Role.OWNER;
    }

    const collaboration = await tx.documentCollaborator.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId,
        },
      },
      select: { role: true },
    });

    if (!collaboration) {
      return null;
    }

    return collaboration.role as Role;
  });
}

export async function assertRole(userId: string, documentId: string, minRole: Role) {
  const userRole = await getUserRole(userId, documentId);
  if (!userRole) {
    throw new ForbiddenError("No access to document");
  }

  const userRoleValue = roleValues[userRole];
  const minRoleValue = roleValues[minRole];

  if (userRoleValue < minRoleValue) {
    throw new ForbiddenError(`Insufficient permissions. Required: ${minRole}`);
  }

  return userRole;
}
