/**
 * load-document.ts — Hocuspocus `onLoadDocument` hook.
 *
 * Hocuspocus calls this hook when a document is first loaded into memory
 * (i.e. when the first client opens it).  The `@hocuspocus/extension-database`
 * extension also handles this, but we keep a manual hook here for:
 *
 *  1. Logging that a document has been loaded.
 *  2. Giving us a hook point to extend in the future (e.g. seeding a fresh
 *     Y.Doc with default content on first creation).
 *
 * If using `extension-database`, that extension hydrates the document from
 * Postgres automatically via its own `fetch` call.  When both are present,
 * `extension-database` runs first (it's registered as an extension), and this
 * hook can remain a no-op / logger.
 *
 * DECISION: We rely on `extension-database` for the actual fetch rather than
 * duplicating the Postgres read here, keeping the persistence code in a single
 * place (`postgres-store.ts`).
 */

import type { onLoadDocumentPayload } from "@hocuspocus/server";
import type { ConnectionContext } from "./authenticate.js";

export async function onLoadDocument(data: onLoadDocumentPayload): Promise<void> {
  const { documentName, context } = data;

  const ctx = context as Partial<ConnectionContext> | undefined;

  // Log document load for visibility during development.
  if (process.env["NODE_ENV"] !== "production") {
    console.log(
      `[hocuspocus] Loading document "${documentName}" for user "${ctx?.userId ?? "unknown"}"`,
    );
  }
}
