import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

interface ActiveDocSession {
  ydoc: Y.Doc;
  provider: IndexeddbPersistence;
}

const activeSessions = new Map<string, ActiveDocSession>();

export function getOrCreateLocalDoc(documentId: string): ActiveDocSession {
  const existing = activeSessions.get(documentId);
  if (existing) {
    return existing;
  }

  const ydoc = new Y.Doc();

  // Backed by y-indexeddb using the document ID as the database room name
  const provider = new IndexeddbPersistence(documentId, ydoc);

  // Initialize standard structures (ProseMirror XML Fragment + meta Map)
  // These get created lazily but we can reference them to ensure they are instantiated
  ydoc.getXmlFragment("default");
  ydoc.getMap("meta");

  const session: ActiveDocSession = { ydoc, provider };
  activeSessions.set(documentId, session);

  return session;
}

export function destroyLocalDoc(documentId: string): void {
  const session = activeSessions.get(documentId);
  if (session) {
    session.provider.destroy();
    session.ydoc.destroy();
    activeSessions.delete(documentId);
  }
}
