import { describe, it, expect } from "vitest";
import {
  CreateDocumentInput,
  UpdateDocumentInput,
  InviteCollaboratorInput,
  CreateVersionInput,
  RestoreVersionInput,
  Role,
} from "@syncpad/shared";

describe("Zod Schema Validation Tests", () => {
  describe("CreateDocumentInput", () => {
    it("should accept valid titles", () => {
      const result = CreateDocumentInput.safeParse({ title: "My Awesome Doc" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("My Awesome Doc");
      }
    });

    it("should fall back to default when title is missing", () => {
      const result = CreateDocumentInput.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Untitled Document");
      }
    });

    it("should reject empty titles", () => {
      const result = CreateDocumentInput.safeParse({ title: "" });
      expect(result.success).toBe(false);
    });

    it("should reject titles longer than 255 characters", () => {
      const longTitle = "a".repeat(256);
      const result = CreateDocumentInput.safeParse({ title: longTitle });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdateDocumentInput", () => {
    it("should accept valid titles", () => {
      const result = UpdateDocumentInput.safeParse({ title: "Updated Title" });
      expect(result.success).toBe(true);
    });

    it("should accept empty update payload", () => {
      const result = UpdateDocumentInput.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should reject empty string titles", () => {
      const result = UpdateDocumentInput.safeParse({ title: "" });
      expect(result.success).toBe(false);
    });

    it("should reject titles longer than 255 characters", () => {
      const longTitle = "a".repeat(256);
      const result = UpdateDocumentInput.safeParse({ title: longTitle });
      expect(result.success).toBe(false);
    });
  });

  describe("InviteCollaboratorInput", () => {
    it("should accept valid email and role", () => {
      const result = InviteCollaboratorInput.safeParse({
        email: "collab@example.com",
        role: Role.EDITOR,
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid emails", () => {
      const result = InviteCollaboratorInput.safeParse({
        email: "not-an-email",
        role: Role.VIEWER,
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid roles", () => {
      const result = InviteCollaboratorInput.safeParse({
        email: "collab@example.com",
        role: "ADMIN",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CreateVersionInput", () => {
    it("should accept valid labels", () => {
      const result = CreateVersionInput.safeParse({ label: "Manual Snapshot 1" });
      expect(result.success).toBe(true);
    });

    it("should accept empty version payloads", () => {
      const result = CreateVersionInput.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should reject version labels longer than 120 characters", () => {
      const longLabel = "a".repeat(121);
      const result = CreateVersionInput.safeParse({ label: longLabel });
      expect(result.success).toBe(false);
    });
  });

  describe("RestoreVersionInput", () => {
    it("should accept valid version ID", () => {
      const result = RestoreVersionInput.safeParse({ versionId: "version-123" });
      expect(result.success).toBe(true);
    });

    it("should reject missing version ID", () => {
      const result = RestoreVersionInput.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
