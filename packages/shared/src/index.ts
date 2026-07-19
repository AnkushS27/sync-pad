import { z } from "zod";

export const Role = {
  OWNER: "OWNER",
  EDITOR: "EDITOR",
  VIEWER: "VIEWER",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const RoleSchema = z.nativeEnum(Role);

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
