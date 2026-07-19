import Dexie, { type Table } from "dexie";

export interface CachedDocument {
  id: string;
  title: string;
  ownerId: string;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingOp {
  id?: number;
  documentId: string;
  timestamp: number;
  changeType: string; // "edit" | "delete" | "rename"
  title?: string;
}

export interface CachedVersion {
  id: string;
  documentId: string;
  label: string | null;
  createdAt: string;
}

class SyncPadLocalDatabase extends Dexie {
  documentsMeta!: Table<CachedDocument, string>;
  pendingOps!: Table<PendingOp, number>;
  versionsCache!: Table<CachedVersion, string>;

  constructor() {
    super("SyncPadLocalDb");
    this.version(1).stores({
      documentsMeta: "id, title, ownerId, ownerEmail, updatedAt, createdAt",
      pendingOps: "++id, documentId, timestamp, changeType",
      versionsCache: "id, documentId, label, createdAt",
    });
  }
}

export const localDb = new SyncPadLocalDatabase();
