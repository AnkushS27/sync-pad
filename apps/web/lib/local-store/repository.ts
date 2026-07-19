import { localDb, type CachedDocument } from "./dexie";
import { getOrCreateLocalDoc, destroyLocalDoc } from "./yjs-doc";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

export interface DocumentSession {
  ydoc: Y.Doc;
  provider: IndexeddbPersistence;
}

interface CacheDocInput {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner?: {
    email: string;
  } | null;
}

export const LocalDocumentStore = {
  /**
   * Opens a document session. Retrieves cached document from in-memory session map
   * and initializes IndexedDB provider.
   */
  openDocument(documentId: string): DocumentSession {
    return getOrCreateLocalDoc(documentId);
  },

  /**
   * Closes a document session, destroying its provider and listeners.
   */
  closeDocument(documentId: string): void {
    destroyLocalDoc(documentId);
  },

  /**
   * Caches the list of documents fetched from the server.
   */
  async cacheDocumentsList(docs: CacheDocInput[]): Promise<void> {
    try {
      const cachedDocs: CachedDocument[] = docs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        ownerId: doc.ownerId,
        ownerEmail: doc.owner?.email || "",
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));

      await localDb.transaction("rw", localDb.documentsMeta, async () => {
        // Clear old metadata
        await localDb.documentsMeta.clear();
        // Insert new records
        await localDb.documentsMeta.bulkAdd(cachedDocs);
      });
    } catch (error) {
      console.error("Failed to cache documents list in Dexie:", error);
    }
  },

  /**
   * Lists all documents cached locally. Used for offline view.
   */
  async listCachedDocuments(): Promise<CachedDocument[]> {
    try {
      return await localDb.documentsMeta.toArray();
    } catch (error) {
      console.error("Failed to read cached documents list from Dexie:", error);
      return [];
    }
  },

  /**
   * Gets the number of pending updates awaiting sync for a document.
   */
  async getPendingOpsCount(documentId: string): Promise<number> {
    try {
      return await localDb.pendingOps.where("documentId").equals(documentId).count();
    } catch (error) {
      console.error("Failed to get pending ops count from Dexie:", error);
      return 0;
    }
  },
};
