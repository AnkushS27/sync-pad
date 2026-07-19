import { z } from "zod";

// ─── Role ────────────────────────────────────────────────────────────────────

export const Role = {
  OWNER: "OWNER",
  EDITOR: "EDITOR",
  VIEWER: "VIEWER",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const RoleSchema = z.nativeEnum(Role);

// ─── Document CRUD schemas ───────────────────────────────────────────────────

export const CreateDocumentInput = z.object({
  title: z.string().min(1).max(255).default("Untitled Document"),
});

export const UpdateDocumentInput = z.object({
  title: z.string().min(1).max(255).optional(),
});

export const InviteCollaboratorInput = z.object({
  email: z.string().email("Invalid email address"),
  role: RoleSchema,
});

export const CreateVersionInput = z.object({
  label: z.string().trim().min(1).max(120).optional(),
});

export const RestoreVersionInput = z.object({
  versionId: z.string().min(1),
});

// ─── Shared size limits ───────────────────────────────────────────────────────
// These constants are the single source of truth for both apps/web (REST
// payload validation) and apps/sync-server (WS transport + persistence guards).

/** Maximum encoded Yjs state that will be persisted to Postgres (5 MB). */
export const MAX_DOCUMENT_SIZE_BYTES = Number(process.env["MAX_DOCUMENT_SIZE_BYTES"]) || 5_000_000;

/** Maximum WebSocket frame size accepted at the transport layer (1 MB). */
export const MAX_WS_MESSAGE_BYTES = Number(process.env["MAX_WS_MESSAGE_BYTES"]) || 1_000_000;

/** Maximum JSON request body accepted by mutation-capable REST routes (32 KB). */
export const MAX_REST_BODY_BYTES = Number(process.env["MAX_REST_BODY_BYTES"]) || 32_768;

/** Lifetime of short-lived WS auth tokens (seconds). */
export const SYNC_TOKEN_TTL_SECONDS = 60;

/** Coarse auto-version interval; picked to provide useful history without row spam. */
export const AUTO_VERSION_INTERVAL_MS = 15 * 60 * 1000;

// ─── WS token payload type ────────────────────────────────────────────────────
// Minted by apps/web GET /api/documents/[id]/token and verified by
// apps/sync-server onAuthenticate.  Keep the surface minimal.

export interface WsTokenPayload {
  userId: string;
  documentId: string;
  role: Role;
  /** Unix timestamp seconds — standard JWT field. */
  exp: number;
  /** Issued-at — standard JWT field. */
  iat: number;
}
