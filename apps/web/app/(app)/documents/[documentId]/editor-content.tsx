"use client";

/**
 * editor-content.tsx — Client-side editor component (Phase 7 wired version).
 *
 * Assembly order (important for UX — user is typing before WS connects):
 *  1. Local Y.Doc is opened from IndexedDB (Phase 4) — instant, no network.
 *  2. Tiptap is initialised with the local Y.Doc — editor is immediately usable.
 *  3. HocuspocusProvider is created in the background (useEffect after mount).
 *  4. Provider events drive the Zustand connection-state store.
 *  5. Awareness updates are throttled to ~100 ms to prevent per-keystroke
 *     re-renders across all connected clients.
 *  6. Pending-ops counter increments on each local Yjs update while offline /
 *     connecting, and is cleared once `provider.synced` fires (via the store).
 *
 * VIEWER read-only enforcement (three layers):
 *  - This component receives `role` from the server component (page.tsx).
 *  - The Tiptap editor is set `editable: false` when role === "VIEWER".
 *  - The sync server independently rejects any update whose context.role is
 *    VIEWER (hooks/change.ts).  The UI enforcement here is UX; the server is
 *    the security boundary.
 */

import * as React from "react";
import Link from "next/link";
import * as Y from "yjs";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { LocalDocumentStore } from "@/lib/local-store/repository";
import { localDb } from "@/lib/local-store/dexie";
import { createSyncProvider } from "@/lib/sync/provider";
import { useConnectionState } from "@/lib/sync/connection-state";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  WifiOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  Bold,
  Italic,
  List as ListIcon,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Undo,
  Redo,
  Users,
} from "lucide-react";

// ─── Presence colours ─────────────────────────────────────────────────────────
// Deterministically pick a colour from this palette based on userId so the same
// user always gets the same colour across tabs/sessions.
const PRESENCE_COLOURS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f97316", // orange
  "#14b8a6", // teal
];

function userColour(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PRESENCE_COLOURS[hash % PRESENCE_COLOURS.length]!;
}

// ─── Awareness throttle ───────────────────────────────────────────────────────
// Broadcasting cursor position on every keystroke/mousemove would cause
// per-keystroke re-renders on every connected client.  ~100 ms is the sweet
// spot between responsiveness and churn.
const AWARENESS_THROTTLE_MS = 100;

function makeThrottledAwarenessUpdater(provider: HocuspocusProvider, field: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: unknown = undefined;

  return function update(value: unknown) {
    pendingValue = value;
    if (timer !== null) return; // already scheduled
    timer = setTimeout(() => {
      timer = null;
      provider.awareness?.setLocalStateField(field, pendingValue);
    }, AWARENESS_THROTTLE_MS);
  };
}

// ─── Editor styles ────────────────────────────────────────────────────────────

const editorStyles = `
  .ProseMirror {
    outline: none;
    min-height: 550px;
    font-family: var(--font-sans), sans-serif;
    font-size: 1rem;
    line-height: 1.75;
    color: var(--color-zinc-100);
    padding: 2.5rem;
  }
  .ProseMirror p {
    margin-bottom: 1.25rem;
  }
  .ProseMirror h1 {
    font-size: 2rem;
    font-weight: 800;
    margin-top: 2rem;
    margin-bottom: 1rem;
    letter-spacing: -0.025em;
    color: white;
  }
  .ProseMirror h2 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-top: 1.75rem;
    margin-bottom: 0.75rem;
    color: white;
  }
  .ProseMirror h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
    color: white;
  }
  .ProseMirror ul {
    list-style-type: disc;
    padding-left: 1.75rem;
    margin-bottom: 1.25rem;
  }
  .ProseMirror ol {
    list-style-type: decimal;
    padding-left: 1.75rem;
    margin-bottom: 1.25rem;
  }
  .ProseMirror blockquote {
    border-left: 4px solid #6366f1;
    padding-left: 1.25rem;
    font-style: italic;
    color: #a1a1aa;
    margin-bottom: 1.25rem;
    background-color: rgba(99, 102, 241, 0.03);
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }
  .ProseMirror pre {
    background-color: #18181b;
    border: 1px solid #27272a;
    padding: 1rem;
    border-radius: 0.5rem;
    font-family: var(--font-mono), monospace;
    margin-bottom: 1.25rem;
    overflow-x: auto;
  }
  .ProseMirror code {
    font-family: var(--font-mono), monospace;
    background-color: #27272a;
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }

  /* Collaboration caret styles */
  .collaboration-cursor__caret {
    border-left: 1px solid;
    border-right: 1px solid;
    margin-left: -1px;
    margin-right: -1px;
    pointer-events: none;
    position: relative;
    word-break: normal;
  }
  .collaboration-cursor__label {
    border-radius: 3px 3px 3px 0;
    color: #0d0d0d;
    font-size: 10px;
    font-style: normal;
    font-weight: 600;
    left: -1px;
    line-height: normal;
    padding: 0.1rem 0.3rem;
    position: absolute;
    top: -1.4em;
    user-select: none;
    white-space: nowrap;
    pointer-events: none;
  }
`;

// ─── Connection indicator ─────────────────────────────────────────────────────

function ConnectionIndicator() {
  const { status, pendingOpsCount } = useConnectionState();

  const configs = {
    offline: {
      icon: <WifiOff className="h-3 w-3" />,
      label: "Offline",
      className: "bg-yellow-950/20 border-yellow-900/30 text-yellow-500",
    },
    connecting: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Connecting…",
      className: "bg-blue-950/20 border-blue-900/30 text-blue-400",
    },
    syncing: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Syncing…",
      className: "bg-indigo-950/20 border-indigo-900/30 text-indigo-400",
    },
    synced: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "Synced",
      className: "bg-emerald-950/20 border-emerald-900/30 text-emerald-400",
    },
    error: {
      icon: <AlertCircle className="h-3 w-3" />,
      label: "Error",
      className: "bg-red-950/20 border-red-900/30 text-red-400",
    },
  } as const;

  const cfg = configs[status];

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-[10px] font-semibold ${cfg.className}`}
      >
        {cfg.icon}
        <span>{cfg.label}</span>
      </div>

      {/* Pending ops counter — only shown when there are unsynced changes */}
      {pendingOpsCount > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-[10px] font-semibold text-zinc-400">
          <Database className="h-3 w-3 text-zinc-500" />
          <span>{pendingOpsCount} pending</span>
        </div>
      )}
    </div>
  );
}

// ─── Presence avatar strip ────────────────────────────────────────────────────

interface PresenceUser {
  clientId: number;
  name: string;
  colour: string;
}

function PresenceAvatars({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1" title={`${users.length} collaborator(s) online`}>
      <Users className="h-3.5 w-3.5 text-zinc-500" />
      <div className="flex -space-x-1.5">
        {users.slice(0, 5).map((u) => (
          <div
            key={u.clientId}
            className="h-6 w-6 rounded-full border-2 border-zinc-950 flex items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: u.colour }}
            title={u.name}
          >
            {u.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {users.length > 5 && (
          <div className="h-6 w-6 rounded-full border-2 border-zinc-950 bg-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-300">
            +{users.length - 5}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface EditorContentComponentProps {
  documentId: string;
  currentUser: {
    id: string;
    email: string;
    name: string | null;
  };
  /** Role passed from the server component — used to enforce read-only on client. */
  role?: "OWNER" | "EDITOR" | "VIEWER";
}

export function EditorContentComponent(props: EditorContentComponentProps) {
  return <EditorPanel {...props} />;
}

function EditorPanel({ documentId, currentUser, role = "EDITOR" }: EditorContentComponentProps) {
  const [title, setTitle] = React.useState("Loading document…");
  const [presenceUsers, setPresenceUsers] = React.useState<PresenceUser[]>([]);
  const [syncSession, setSyncSession] = React.useState<{
    ydoc: Y.Doc;
    provider: HocuspocusProvider;
  } | null>(null);

  const { incrementPendingOps, reset: resetConnectionState } = useConnectionState();

  // ── 1. Open local Y.Doc & HocuspocusProvider (instant / background) ────────
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let active = true;
    const session = LocalDocumentStore.openDocument(documentId);
    const provider = createSyncProvider(documentId, session.ydoc, {
      connectionGeneration: 1,
    });

    queueMicrotask(() => {
      if (active) {
        setSyncSession({ ydoc: session.ydoc, provider });
      }
    });

    provider.connect();

    return () => {
      active = false;
      provider.destroy();
      LocalDocumentStore.closeDocument(documentId);
      resetConnectionState();
    };
  }, [documentId, resetConnectionState]);

  if (!syncSession) {
    return (
      <div className="flex-1 flex flex-col bg-black min-h-screen text-zinc-100 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Database className="h-8 w-8 text-zinc-500 animate-pulse" />
          <span className="text-sm text-zinc-500 font-medium">Initializing Local Database…</span>
        </div>
      </div>
    );
  }

  return (
    <EditorWorkspace
      documentId={documentId}
      currentUser={currentUser}
      role={role}
      title={title}
      setTitle={setTitle}
      presenceUsers={presenceUsers}
      setPresenceUsers={setPresenceUsers}
      ydoc={syncSession.ydoc}
      provider={syncSession.provider}
      incrementPendingOps={incrementPendingOps}
    />
  );
}

interface EditorWorkspaceProps extends EditorContentComponentProps {
  title: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  presenceUsers: PresenceUser[];
  setPresenceUsers: React.Dispatch<React.SetStateAction<PresenceUser[]>>;
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  incrementPendingOps: () => void;
}

function EditorWorkspace({
  documentId,
  currentUser,
  role = "EDITOR",
  title,
  setTitle,
  presenceUsers,
  setPresenceUsers,
  ydoc,
  provider,
  incrementPendingOps,
}: EditorWorkspaceProps) {
  // ── 2. Tiptap editor with local Y.Doc + collaboration caret ────────────────
  const displayName = currentUser.name ?? currentUser.email;
  const caretColour = userColour(currentUser.id);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Collaboration manages its own undo/redo stack (Y-undo).
        undoRedo: false,
      }),
      Collaboration.configure({
        document: ydoc,
        field: "default",
      }),
      CollaborationCaret.configure({
        provider: provider,
        user: {
          name: displayName,
          color: caretColour,
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: "focus:outline-none max-w-none min-h-[550px]",
      },
    },
    editable: role !== "VIEWER",
    immediatelyRender: false,
  });

  // ── 3. Wire CollaborationCaret to the live provider awareness ──────────────
  React.useEffect(() => {
    if (typeof window === "undefined" || !provider || !provider.awareness) return;

    // Set local user info in awareness.
    provider.awareness.setLocalStateField("user", {
      name: displayName,
      color: caretColour,
    });

    // Throttled cursor position broadcast.
    const updateCursor = makeThrottledAwarenessUpdater(provider, "cursor");

    // Update presence list whenever awareness changes.
    const onAwarenessChange = () => {
      const states = provider.awareness?.getStates();
      if (!states) return;

      const localClientId = provider.awareness?.clientID;
      const users: PresenceUser[] = [];

      states.forEach((state, clientId) => {
        // Exclude self from the presence avatars list.
        if (clientId === localClientId) return;
        const user = state["user"] as { name?: string; color?: string } | undefined;
        if (user?.name) {
          users.push({
            clientId,
            name: user.name,
            colour: user.color ?? "#6366f1",
          });
        }
      });

      setPresenceUsers(users);
    };

    provider.awareness.on("change", onAwarenessChange);
    provider.awareness.on("change", () => updateCursor(null));

    // Return cleanup for inner awareness listeners.
    return () => {
      provider.awareness?.off("change", onAwarenessChange);
    };
  }, [provider, displayName, caretColour, setPresenceUsers]);

  // ── 4. Track pending ops while offline ─────────────────────────────────────
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // Increment pending-ops count on every local Yjs update.
    // The count is cleared when the provider fires `onSynced` (handled inside
    // createSyncProvider → connection-state store's clearPendingOps action).
    const onUpdate = () => {
      const { status } = useConnectionState.getState();
      // Only count ops that arrive while not synced (i.e., offline / connecting).
      if (status !== "synced") {
        incrementPendingOps();
      }
    };

    ydoc.on("update", onUpdate);
    return () => {
      ydoc.off("update", onUpdate);
    };
  }, [ydoc, incrementPendingOps]);

  // ── 6. Load document title ──────────────────────────────────────────────────
  React.useEffect(() => {
    let active = true;

    async function loadTitle() {
      // Instantly read from Dexie cache.
      const cached = await localDb.documentsMeta.get(documentId);
      if (cached && active) {
        setTitle(cached.title);
      }

      // Fetch from network in background.
      try {
        const res = await fetch(`/api/documents/${documentId}`);
        if (res.ok) {
          const data = (await res.json()) as { title: string };
          if (active) {
            setTitle(data.title);
            if (cached) {
              await localDb.documentsMeta.update(documentId, { title: data.title });
            }
          }
        }
      } catch {
        // Offline or network failed — cached title is already shown.
      }
    }

    loadTitle();
    return () => {
      active = false;
    };
  }, [documentId, setTitle]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!editor) {
    return (
      <div className="flex-1 flex flex-col bg-black min-h-screen text-zinc-100 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Database className="h-8 w-8 text-zinc-500 animate-pulse" />
          <span className="text-sm text-zinc-500 font-medium">Initializing Local Database…</span>
        </div>
      </div>
    );
  }

  const isReadOnly = role === "VIEWER";

  return (
    <div className="flex-1 flex flex-col bg-black min-h-screen text-zinc-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      <style>{editorStyles}</style>

      {/* ── Editor Top Navigation ── */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/documents"
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm text-white truncate max-w-[200px] sm:max-w-[400px]">
                {title}
              </span>
              {isReadOnly && (
                <span className="text-[10px] text-amber-500 font-medium">Read-only (Viewer)</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Presence avatars */}
            <PresenceAvatars users={presenceUsers} />

            {/* Connection status badge */}
            <ConnectionIndicator />
          </div>
        </div>
      </header>

      {/* ── Format Toolbar (hidden for viewers) ── */}
      {!isReadOnly && (
        <div className="w-full border-b border-zinc-900 bg-zinc-950/50 py-1.5 sticky top-14 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 ${editor.isActive("bold") ? "bg-zinc-800 text-white" : ""}`}
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 ${editor.isActive("italic") ? "bg-zinc-800 text-white" : ""}`}
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-zinc-800 mx-1" />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={`h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 ${editor.isActive("heading", { level: 1 }) ? "bg-zinc-800 text-white" : ""}`}
              title="Heading 1"
            >
              <Heading1 className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 ${editor.isActive("heading", { level: 2 }) ? "bg-zinc-800 text-white" : ""}`}
              title="Heading 2"
            >
              <Heading2 className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={`h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 ${editor.isActive("heading", { level: 3 }) ? "bg-zinc-800 text-white" : ""}`}
              title="Heading 3"
            >
              <Heading3 className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-zinc-800 mx-1" />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={`h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 ${editor.isActive("bulletList") ? "bg-zinc-800 text-white" : ""}`}
              title="Bullet List"
            >
              <ListIcon className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={`h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 ${editor.isActive("orderedList") ? "bg-zinc-800 text-white" : ""}`}
              title="Numbered List"
            >
              <ListOrdered className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-zinc-800 mx-1" />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={`h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 ${editor.isActive("blockquote") ? "bg-zinc-800 text-white" : ""}`}
              title="Blockquote"
            >
              <Quote className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              className={`h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800 ${editor.isActive("codeBlock") ? "bg-zinc-800 text-white" : ""}`}
              title="Code Block"
            >
              <Code className="h-4 w-4" />
            </Button>

            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => editor.chain().focus().undo().run()}
                className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
                title="Undo"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => editor.chain().focus().redo().run()}
                className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
                title="Redo"
              >
                <Redo className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Editor Content Area ── */}
      <main className="flex-grow max-w-4xl w-full mx-auto px-4 py-8">
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl shadow-xl min-h-[600px]">
          <EditorContent editor={editor} />
        </div>
      </main>
    </div>
  );
}
