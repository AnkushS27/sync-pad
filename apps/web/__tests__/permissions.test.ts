import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requireUser,
  getUserRole,
  assertRole,
  UnauthorizedError,
  ForbiddenError,
} from "../lib/permissions";
import { Role } from "@syncpad/shared";

// Setup mocks
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

const mockTx = {
  document: {
    findUnique: vi.fn(),
  },
  documentCollaborator: {
    findUnique: vi.fn(),
  },
};

const mockWithRLS = vi.fn((userId, fn) => fn(mockTx));
vi.mock("@syncpad/db", () => ({
  withRLS: (userId: string, fn: any) => mockWithRLS(userId, fn),
}));

describe("Permissions Unit Tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithRLS.mockImplementation((userId, fn) => fn(mockTx));
  });

  describe("requireUser", () => {
    it("should return the user object when session is active", async () => {
      mockAuth.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } });
      const user = await requireUser();
      expect(user.id).toBe("user-1");
    });

    it("should throw UnauthorizedError when no active session exists", async () => {
      mockAuth.mockResolvedValue(null);
      await expect(requireUser()).rejects.toThrow(UnauthorizedError);
    });

    it("should throw UnauthorizedError when session user has no ID", async () => {
      mockAuth.mockResolvedValue({ user: {} });
      await expect(requireUser()).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("getUserRole", () => {
    it("should return null if the document does not exist", async () => {
      mockTx.document.findUnique.mockResolvedValue(null);
      const role = await getUserRole("user-1", "doc-1");
      expect(role).toBeNull();
      expect(mockTx.document.findUnique).toHaveBeenCalledWith({
        where: { id: "doc-1" },
        select: { ownerId: true },
      });
    });

    it("should return OWNER if the user is the document owner", async () => {
      mockTx.document.findUnique.mockResolvedValue({ ownerId: "user-1" });
      const role = await getUserRole("user-1", "doc-1");
      expect(role).toBe(Role.OWNER);
    });

    it("should return the collaborator role if the user is a collaborator", async () => {
      mockTx.document.findUnique.mockResolvedValue({ ownerId: "owner-id" });
      mockTx.documentCollaborator.findUnique.mockResolvedValue({ role: Role.EDITOR });

      const role = await getUserRole("user-1", "doc-1");
      expect(role).toBe(Role.EDITOR);
      expect(mockTx.documentCollaborator.findUnique).toHaveBeenCalledWith({
        where: {
          documentId_userId: {
            documentId: "doc-1",
            userId: "user-1",
          },
        },
        select: { role: true },
      });
    });

    it("should return null if the user has no ownership or collaboration relation", async () => {
      mockTx.document.findUnique.mockResolvedValue({ ownerId: "owner-id" });
      mockTx.documentCollaborator.findUnique.mockResolvedValue(null);

      const role = await getUserRole("user-1", "doc-1");
      expect(role).toBeNull();
    });
  });

  describe("assertRole", () => {
    it("should succeed and return user role if user has equal or higher role than required", async () => {
      // Owner requesting VIEWER
      mockTx.document.findUnique.mockResolvedValue({ ownerId: "user-1" });
      let role = await assertRole("user-1", "doc-1", Role.VIEWER);
      expect(role).toBe(Role.OWNER);

      // Editor requesting EDITOR
      mockTx.document.findUnique.mockResolvedValue({ ownerId: "owner-id" });
      mockTx.documentCollaborator.findUnique.mockResolvedValue({ role: Role.EDITOR });
      role = await assertRole("user-1", "doc-1", Role.EDITOR);
      expect(role).toBe(Role.EDITOR);
    });

    it("should throw ForbiddenError if the document is not shared with user", async () => {
      mockTx.document.findUnique.mockResolvedValue({ ownerId: "owner-id" });
      mockTx.documentCollaborator.findUnique.mockResolvedValue(null);

      await expect(assertRole("user-1", "doc-1", Role.VIEWER)).rejects.toThrow(ForbiddenError);
    });

    it("should throw ForbiddenError if user role is lower than required", async () => {
      // Viewer requesting EDITOR
      mockTx.document.findUnique.mockResolvedValue({ ownerId: "owner-id" });
      mockTx.documentCollaborator.findUnique.mockResolvedValue({ role: Role.VIEWER });

      await expect(assertRole("user-1", "doc-1", Role.EDITOR)).rejects.toThrow(ForbiddenError);
    });
  });
});
