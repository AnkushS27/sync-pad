/**
 * GET /api/documents/[id]/token
 *
 * Mints a short-lived, signed JWT that the browser passes into
 * HocuspocusProvider({ token }).  The sync-server's `onAuthenticate`
 * hook verifies this token — it never calls NextAuth directly.
 *
 * Security contract:
 *  1. Caller must have an active NextAuth session (checked here via auth()).
 *  2. Caller must have at least VIEWER access to the document.
 *  3. The returned token encodes { userId, documentId, role } and expires in
 *     SYNC_TOKEN_TTL_SECONDS (60 s).  Short TTL forces re-fetch on reconnect,
 *     which is what we want (see provider.ts token factory).
 *  4. The token is signed with SYNC_SERVER_INTERNAL_SECRET — the same secret
 *     configured in apps/sync-server.  Neither the secret nor the signing
 *     algorithm is sent to the client.
 */

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { requireUser, getUserRole, UnauthorizedError, ForbiddenError } from "@/lib/permissions";
import { SYNC_TOKEN_TTL_SECONDS, type WsTokenPayload } from "@syncpad/shared";

function getSyncSecret(): string {
  const secret = process.env["SYNC_SERVER_INTERNAL_SECRET"];
  if (!secret) {
    throw new Error("SYNC_SERVER_INTERNAL_SECRET is not configured");
  }
  return secret;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 1. Verify the caller has an active session.
    const user = await requireUser();
    const userId = user.id!;

    // 2. Verify the caller has at least VIEWER access.
    const role = await getUserRole(userId, id);
    if (!role) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Mint a short-lived signed JWT.
    const payload: Omit<WsTokenPayload, "iat" | "exp"> = {
      userId,
      documentId: id,
      role,
    };

    const token = jwt.sign(payload, getSyncSecret(), {
      expiresIn: SYNC_TOKEN_TTL_SECONDS,
      algorithm: "HS256",
    });

    return NextResponse.json({ token });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/documents/[id]/token failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
