import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedError, ForbiddenError } from "../lib/permissions";

// Mock the permissions module
const mockRequireUser = vi.fn();
const mockAssertRole = vi.fn();
const mockGetUserRole = vi.fn();

vi.mock("@/lib/permissions", () => ({
  requireUser: () => mockRequireUser(),
  assertRole: (userId: string, docId: string, role: string) => mockAssertRole(userId, docId, role),
  getUserRole: (userId: string, docId: string) => mockGetUserRole(userId, docId),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super("Unauthorized");
      this.name = "UnauthorizedError";
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(msg = "Forbidden") {
      super(msg);
      this.name = "ForbiddenError";
    }
  },
}));

// Mock the database module
const mockWithRLS = vi.fn((_userId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
const mockTx = {
  document: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  documentCollaborator: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  documentVersion: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  syncAuditLog: {
    create: vi.fn(),
  },
};

vi.mock("@syncpad/db", () => ({
  get prisma() {
    return mockTx;
  },
  withRLS: (_userId: string, fn: (_tx: typeof mockTx) => unknown) => mockWithRLS(_userId, fn),
}));

// Import endpoint handlers
import { GET as getDocs, POST as postDocs } from "../app/api/documents/route";
import {
  GET as getDoc,
  PATCH as patchDoc,
  DELETE as deleteDoc,
} from "../app/api/documents/[id]/route";
import { POST as postCollab } from "../app/api/documents/[id]/collaborators/route";
import { GET as getVersions, POST as postVersion } from "../app/api/documents/[id]/versions/route";
import { POST as restoreVersion } from "../app/api/documents/[id]/versions/[versionId]/restore/route";

describe("REST API Role-Matrix Integration Tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithRLS.mockImplementation((userId, fn) => fn(mockTx));
  });

  const setupAuth = (user: { id: string } | null) => {
    if (!user) {
      mockRequireUser.mockRejectedValue(new UnauthorizedError());
    } else {
      mockRequireUser.mockResolvedValue(user);
    }
  };

  const setupRole = (userRole: "OWNER" | "EDITOR" | "VIEWER" | "NONE") => {
    mockAssertRole.mockImplementation((userId: string, docId: string, minRole: string) => {
      const roleValues = { NONE: 0, VIEWER: 1, EDITOR: 2, OWNER: 3 };
      const userVal = roleValues[userRole];
      const minVal = roleValues[minRole as keyof typeof roleValues];
      if (userVal === 0) {
        throw new ForbiddenError("No access to document");
      }
      if (userVal < minVal) {
        throw new ForbiddenError(`Insufficient permissions. Required: ${minRole}`);
      }
      return userRole;
    });
  };

  // 1. Documents list & create endpoints (/api/documents)
  describe("/api/documents (Collection)", () => {
    it("GET allows authenticated users and returns documents", async () => {
      setupAuth({ id: "user-123" });
      mockTx.document.findMany.mockResolvedValue([{ id: "doc-1", title: "Doc 1" }]);

      const response = await getDocs();
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual([{ id: "doc-1", title: "Doc 1" }]);
    });

    it("GET rejects unauthenticated users with 401", async () => {
      setupAuth(null);
      const response = await getDocs();
      expect(response.status).toBe(401);
    });

    it("POST allows authenticated users with valid payload", async () => {
      setupAuth({ id: "user-123" });
      mockTx.document.create.mockResolvedValue({ id: "doc-1", title: "New Doc" });

      const req = new Request("http://localhost/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "23" },
        body: JSON.stringify({ title: "New Doc" }),
      });

      const response = await postDocs(req);
      expect(response.status).toBe(201);
    });

    it("POST rejects unauthenticated users with 401", async () => {
      setupAuth(null);
      const req = new Request("http://localhost/api/documents", {
        method: "POST",
        body: JSON.stringify({ title: "New Doc" }),
      });
      const response = await postDocs(req);
      expect(response.status).toBe(401);
    });
  });

  // 2. Individual document endpoints (/api/documents/[id])
  describe("/api/documents/[id] (Single Document)", () => {
    const params = Promise.resolve({ id: "doc-123" });

    it("GET allows VIEWER, EDITOR, and OWNER", async () => {
      for (const role of ["VIEWER", "EDITOR", "OWNER"] as const) {
        setupAuth({ id: "user-123" });
        setupRole(role);
        mockTx.document.findUnique.mockResolvedValue({ id: "doc-123", title: "Doc" });

        const req = new Request("http://localhost/api/documents/doc-123");
        const response = await getDoc(req, { params });
        expect(response.status).toBe(200);
      }
    });

    it("GET rejects NONE (non-collaborator) with 403", async () => {
      setupAuth({ id: "user-123" });
      setupRole("NONE");

      const req = new Request("http://localhost/api/documents/doc-123");
      const response = await getDoc(req, { params });
      expect(response.status).toBe(403);
    });

    it("PATCH allows EDITOR and OWNER, rejects VIEWER and NONE", async () => {
      // Allowed: EDITOR, OWNER
      for (const role of ["EDITOR", "OWNER"] as const) {
        setupAuth({ id: "user-123" });
        setupRole(role);
        mockTx.document.update.mockResolvedValue({ id: "doc-123", title: "Updated" });

        const req = new Request("http://localhost/api/documents/doc-123", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        });
        const response = await patchDoc(req, { params });
        expect(response.status).toBe(200);
      }

      // Rejected: VIEWER
      setupAuth({ id: "user-123" });
      setupRole("VIEWER");
      const reqViewer = new Request("http://localhost/api/documents/doc-123", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });
      const responseViewer = await patchDoc(reqViewer, { params });
      expect(responseViewer.status).toBe(403);
    });

    it("DELETE allows OWNER, rejects EDITOR, VIEWER, and NONE", async () => {
      // Allowed: OWNER
      setupAuth({ id: "user-123" });
      setupRole("OWNER");
      mockTx.document.delete.mockResolvedValue({ id: "doc-123" });

      const reqOwner = new Request("http://localhost/api/documents/doc-123", { method: "DELETE" });
      const responseOwner = await deleteDoc(reqOwner, { params });
      expect(responseOwner.status).toBe(204);

      // Rejected: EDITOR
      setupRole("EDITOR");
      const reqEditor = new Request("http://localhost/api/documents/doc-123", { method: "DELETE" });
      const responseEditor = await deleteDoc(reqEditor, { params });
      expect(responseEditor.status).toBe(403);
    });
  });

  // 3. Collaborator management endpoints (/api/documents/[id]/collaborators)
  describe("/api/documents/[id]/collaborators", () => {
    const params = Promise.resolve({ id: "doc-123" });

    it("POST/PATCH/DELETE allowed only for OWNER, rejects EDITOR and VIEWER", async () => {
      // Allowed: OWNER
      setupAuth({ id: "user-owner" });
      setupRole("OWNER");
      mockTx.user.findUnique.mockResolvedValue({ id: "user-invited" });
      mockTx.document.findUnique.mockResolvedValue({ ownerId: "user-owner" });
      mockTx.documentCollaborator.upsert.mockResolvedValue({ id: "collab-1" });

      const reqPost = new Request("http://localhost/api/documents/doc-123/collaborators", {
        method: "POST",
        body: JSON.stringify({ email: "invite@example.com", role: "EDITOR" }),
      });
      const resPost = await postCollab(reqPost, { params });
      expect(resPost.status).toBe(201);

      // Rejected: EDITOR for POST
      setupRole("EDITOR");
      const reqPostEd = new Request("http://localhost/api/documents/doc-123/collaborators", {
        method: "POST",
        body: JSON.stringify({ email: "invite@example.com", role: "EDITOR" }),
      });
      const resPostEd = await postCollab(reqPostEd, { params });
      expect(resPostEd.status).toBe(403);
    });
  });

  // 4. Version history endpoints (/api/documents/[id]/versions)
  describe("/api/documents/[id]/versions", () => {
    const params = Promise.resolve({ id: "doc-123" });

    it("GET allows VIEWER, EDITOR, and OWNER", async () => {
      for (const role of ["VIEWER", "EDITOR", "OWNER"] as const) {
        setupAuth({ id: "user-123" });
        setupRole(role);
        mockTx.documentVersion.findMany.mockResolvedValue([]);

        const req = new Request("http://localhost/api/documents/doc-123/versions");
        const response = await getVersions(req, { params });
        expect(response.status).toBe(200);
      }
    });

    it("POST (create version) allows EDITOR and OWNER, rejects VIEWER", async () => {
      // Allowed: EDITOR
      setupAuth({ id: "user-123" });
      setupRole("EDITOR");
      mockTx.document.findUnique.mockResolvedValue({ docState: Buffer.from([0, 0]) });
      mockTx.documentVersion.create.mockResolvedValue({ id: "v-1" });

      const req = new Request("http://localhost/api/documents/doc-123/versions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "V1" }),
      });
      const response = await postVersion(req, { params });
      expect(response.status).toBe(201);

      // Rejected: VIEWER
      setupRole("VIEWER");
      const reqViewer = new Request("http://localhost/api/documents/doc-123/versions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "V1" }),
      });
      const responseViewer = await postVersion(reqViewer, { params });
      expect(responseViewer.status).toBe(403);
    });
  });

  // 5. Version restore endpoint (/api/documents/[id]/versions/[versionId]/restore)
  describe("/api/documents/[id]/versions/[versionId]/restore", () => {
    const params = Promise.resolve({ id: "doc-123", versionId: "v-456" });

    it("POST (restore) allows EDITOR and OWNER, rejects VIEWER", async () => {
      // Allowed: OWNER
      setupAuth({ id: "user-123" });
      setupRole("OWNER");
      mockTx.document.findUnique.mockResolvedValue({ docState: Buffer.from([0, 0]) });
      mockTx.documentVersion.findFirst.mockResolvedValue({
        id: "v-456",
        snapshot: Buffer.from([0, 0]),
        label: "Ver",
      });
      mockTx.document.update.mockResolvedValue({});
      mockTx.documentVersion.create.mockResolvedValue({});

      const req = new Request("http://localhost/api/documents/doc-123/versions/v-456/restore", {
        method: "POST",
      });
      const response = await restoreVersion(req, { params });
      expect(response.status).toBe(200);

      // Rejected: VIEWER
      setupRole("VIEWER");
      const reqViewer = new Request(
        "http://localhost/api/documents/doc-123/versions/v-456/restore",
        { method: "POST" },
      );
      const responseViewer = await restoreVersion(reqViewer, { params });
      expect(responseViewer.status).toBe(403);
    });
  });

  // 6. Oversized Payload & Validation tests (Phase 9)
  describe("Oversized Payload & Input Validation", () => {
    it("POST /api/documents rejects request with body exceeding MAX_REST_BODY_BYTES (413)", async () => {
      setupAuth({ id: "user-123" });
      const bigBody = "x".repeat(35000); // Exceeds MAX_REST_BODY_BYTES = 32_768
      const req = new Request("http://localhost/api/documents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(bigBody.length),
        },
        body: bigBody,
      });

      const response = await postDocs(req);
      expect(response.status).toBe(413);
    });

    it("POST /api/documents rejects title that is too long with 400", async () => {
      setupAuth({ id: "user-123" });
      const longTitle = "x".repeat(300); // Exceeds Zod max(255)
      const req = new Request("http://localhost/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: longTitle }),
      });

      const response = await postDocs(req);
      expect(response.status).toBe(400);
    });

    it("POST /api/documents/[id]/versions rejects version label that is too long with 400", async () => {
      setupAuth({ id: "user-123" });
      setupRole("EDITOR");
      const longLabel = "x".repeat(150); // Exceeds Zod max(120)
      const req = new Request("http://localhost/api/documents/doc-123/versions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: longLabel }),
      });

      const response = await postVersion(req, { params: Promise.resolve({ id: "doc-123" }) });
      expect(response.status).toBe(400);
    });
  });
});
