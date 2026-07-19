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
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Save,
  History,
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
    border: none !important;
    margin: 0 !important;
    padding: 0 !important;
    pointer-events: auto; /* enable pointer events so hover state works */
    position: relative;
    word-break: normal;
  }
  .tooltip-bubble {
    visibility: hidden;
    position: absolute;
    color: white !important;
    z-index: 50;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%) translateY(4px);
    font-size: 11px !important;
    font-family: var(--font-sans), sans-serif !important;
    padding: 6px 10px !important;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.15s ease-in-out, transform 0.15s ease-in-out;
    pointer-events: none;
    line-height: 1.25 !important;
  }
  .tooltip-bubble::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
  }
  .avatar-trigger:hover .tooltip-bubble {
    visibility: visible;
    opacity: 1;
    transform: translateX(-50%) translateY(0);
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
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Users className="h-3.5 w-3.5 text-zinc-500" />
        <div className="flex -space-x-1.5">
          {users.slice(0, 5).map((u) => (
            <Tooltip key={u.clientId}>
              <TooltipTrigger
                render={
                  <div
                    className="h-6 w-6 rounded-full border-2 border-zinc-950 flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ backgroundColor: u.colour }}
                  >
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                }
              />
              <TooltipContent
                side="bottom"
                className="bg-white text-black border border-zinc-200 shadow-md font-semibold"
              >
                {u.name}
              </TooltipContent>
            </Tooltip>
          ))}
          {users.length > 5 && (
            <div className="h-6 w-6 rounded-full border-2 border-zinc-950 bg-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-300">
              +{users.length - 5}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
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
  const [saveVersionOpen, setSaveVersionOpen] = React.useState(false);
  const [saveLabel, setSaveLabel] = React.useState("");
  const [isSavingVersion, setIsSavingVersion] = React.useState(false);

  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingVersion(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: saveLabel.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save version");
      }

      setSaveVersionOpen(false);
      setSaveLabel("");
    } catch (err: any) {
      alert(err.message || "An error occurred");
    } finally {
      setIsSavingVersion(false);
    }
  };

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
        render(user) {
          const cursor = document.createElement("span");
          cursor.classList.add("collaboration-cursor__caret");
          cursor.setAttribute(
            "style",
            "position: relative; display: inline-block; width: 0; height: 1.2em; overflow: visible; vertical-align: text-bottom;",
          );

          // Outer trigger container (stable, holds hover state)
          const trigger = document.createElement("span");
          trigger.classList.add("avatar-trigger");
          trigger.setAttribute(
            "style",
            "position: absolute; left: 5px; top: 0; width: 22px; height: 22px;",
          );

          // 1. Blinking avatar circle (pulsing wrapper)
          const avatar = document.createElement("span");
          avatar.classList.add("animate-pulse");
          avatar.setAttribute(
            "style",
            `display: flex; width: 100%; height: 100%; border-radius: 9999px; background-color: ${user.color || "#6366f1"}; color: #ffffff; font-size: 12px; font-weight: bold; align-items: center; justify-content: center; user-select: none; box-shadow: 0 2px 4px rgba(0,0,0,0.5);`,
          );
          avatar.textContent = (user.name || "C").charAt(0).toUpperCase();

          // 2. Stable, non-pulsing tooltip bubble (appended directly to trigger container, NOT inside avatar)
          const tooltip = document.createElement("span");
          tooltip.classList.add("tooltip-bubble");
          tooltip.textContent = user.name || "Collaborator";

          trigger.appendChild(avatar);
          trigger.appendChild(tooltip);
          cursor.appendChild(trigger);
          return cursor;
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

            <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

            {/* Manual Save Version */}
            {!isReadOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveVersionOpen(true)}
                className="h-8 border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 hover:text-white hidden sm:inline-flex"
              >
                <Save className="h-3.5 w-3.5 mr-1.5 text-zinc-400" />
                Save Version
              </Button>
            )}

            {/* History link */}
            <Link
              href={`/documents/${documentId}/versions`}
              className="inline-flex items-center justify-center h-8 rounded-md border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 hover:text-white px-3 text-xs font-semibold transition-colors"
            >
              <History className="h-3.5 w-3.5 mr-1.5 text-zinc-400" />
              History
            </Link>
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

      {/* ── Save Version Dialog ── */}
      <Dialog open={saveVersionOpen} onOpenChange={setSaveVersionOpen}>
        <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-100 max-w-md rounded-xl">
          <form onSubmit={handleSaveVersion}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-white">Save Version</DialogTitle>
              <DialogDescription className="text-sm text-zinc-400">
                Give this version snapshot a descriptive label so you can easily identify it in the
                history timeline later.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="e.g. Completed section 2, Draft V1, etc."
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                maxLength={120}
                className="w-full bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500 focus-visible:ring-indigo-500 animate-none"
                disabled={isSavingVersion}
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSaveVersionOpen(false)}
                disabled={isSavingVersion}
                className="hover:bg-zinc-900 hover:text-zinc-300 text-zinc-400"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSavingVersion}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
              >
                {isSavingVersion ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save Version"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
