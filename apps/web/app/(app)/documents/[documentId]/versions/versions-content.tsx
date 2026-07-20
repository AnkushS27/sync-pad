"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Y from "yjs";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Clock,
  RotateCcw,
  Loader2,
  Calendar,
  User,
  HardDrive,
  FileText,
  AlertCircle,
} from "lucide-react";
import { Role } from "@syncpad/shared";

interface Creator {
  id: string;
  name: string | null;
  email: string;
}

interface DocumentVersionSummary {
  id: string;
  label: string | null;
  sizeBytes: number;
  isAutoSave: boolean;
  createdAt: string;
  createdBy: Creator;
}

interface VersionsContentComponentProps {
  documentId: string;
  currentUser: {
    id: string;
    email: string;
    name: string | null;
  };
  role: Role;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Preview Sub-component ────────────────────────────────────────────────────
interface VersionPreviewProps {
  snapshotBase64: string;
}

function VersionPreview({ snapshotBase64 }: VersionPreviewProps) {
  const ydoc = React.useMemo(() => {
    const doc = new Y.Doc();
    try {
      const bytes = base64ToUint8Array(snapshotBase64);
      Y.applyUpdate(doc, bytes);
    } catch (e) {
      console.error("Failed to apply snapshot to Y.Doc:", e);
    }
    return doc;
  }, [snapshotBase64]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Collaboration.configure({
        document: ydoc,
        field: "default",
      }),
    ],
    editorProps: {
      attributes: {
        class: "focus:outline-none max-w-none min-h-[500px]",
      },
    },
    editable: false,
    immediatelyRender: false,
  });

  if (!editor) return null;

  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 min-h-[550px] ProseMirror-readonly">
      <EditorContent editor={editor} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function VersionsContentComponent({ documentId, role }: VersionsContentComponentProps) {
  const router = useRouter();
  const [versions, setVersions] = React.useState<DocumentVersionSummary[]>([]);
  const [loadingList, setLoadingList] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Selection states
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = React.useState<string | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = React.useState(false);

  // Restore states
  const [isRestoring, setIsRestoring] = React.useState(false);

  // 1. Fetch versions list
  React.useEffect(() => {
    let ignore = false;
    async function load() {
      setError(null);
      try {
        const res = await fetch(`/api/documents/${documentId}/versions`);
        if (!res.ok) throw new Error("Failed to load versions history");
        const data = await res.json();
        if (!ignore) {
          setVersions(data);
          if (data.length > 0) {
            setSelectedId((prev) => prev ?? data[0].id);
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "An error occurred");
        }
      } finally {
        if (!ignore) {
          setLoadingList(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [documentId]);

  // 2. Fetch snapshot for selected version
  React.useEffect(() => {
    if (!selectedId) return;

    let active = true;
    async function fetchSnapshot() {
      setLoadingSnapshot(true);
      try {
        const res = await fetch(`/api/documents/${documentId}/versions/${selectedId}`);
        if (!res.ok) throw new Error("Failed to load version preview");
        const data = await res.json();
        if (active) {
          setSelectedSnapshot(data.snapshotBase64);
        }
      } catch (err: unknown) {
        if (active) {
          alert(err instanceof Error ? err.message : "Could not fetch preview");
        }
      } finally {
        if (active) {
          setLoadingSnapshot(false);
        }
      }
    }

    fetchSnapshot();
    return () => {
      active = false;
    };
  }, [documentId, selectedId]);

  // 3. Restore version handler
  const handleRestore = async () => {
    if (!selectedId) return;
    const confirm = window.confirm(
      "Are you sure you want to restore this version? This will write a new transaction to the live document history.",
    );
    if (!confirm) return;

    setIsRestoring(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions/${selectedId}/restore`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to restore version");
      }

      router.push(`/documents/${documentId}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "An error occurred during restore");
      setIsRestoring(false);
    }
  };

  const selectedVersion = versions.find((v) => v.id === selectedId);
  const isReadOnly = role === "VIEWER";

  return (
    <div className="flex flex-col h-screen bg-black text-zinc-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/documents/${documentId}`}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm text-white truncate">Version History</span>
              <span className="text-[10px] text-zinc-500">Timeline & time travel previews</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestore}
              disabled={isRestoring || isReadOnly || !selectedId || loadingSnapshot}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold border-none h-8 transition-colors"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Restoring…
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Restore Version
                </>
              )}
            </Button>
            <Link
              href={`/documents/${documentId}`}
              className="inline-flex items-center justify-center h-8 rounded-md bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white text-zinc-300 px-3 text-xs font-semibold transition-colors"
            >
              Back to Editor
            </Link>
          </div>
        </div>
      </header>

      {/* Main Split-Pane Workspace */}
      <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
        {/* Left Sidebar - Version List */}
        <aside className="w-full md:w-80 border-r border-zinc-800 bg-zinc-950 flex flex-col h-1/3 md:h-full overflow-hidden">
          <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-zinc-500" />
              Timeline History
            </span>
            <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">
              {versions.length} versions
            </span>
          </div>

          {loadingList ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-zinc-500 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs">Loading timeline…</span>
            </div>
          ) : error ? (
            <div className="flex-1 p-6 text-center text-red-500 flex flex-col items-center justify-center gap-2">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <span className="text-xs font-medium">{error}</span>
            </div>
          ) : versions.length === 0 ? (
            <div className="flex-1 p-6 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
              <FileText className="h-8 w-8 text-zinc-700" />
              <span className="text-xs">No version snapshots exist yet.</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
              {versions.map((version) => {
                const isSelected = version.id === selectedId;
                const authorName = version.createdBy.name || version.createdBy.email.split("@")[0];

                return (
                  <button
                    key={version.id}
                    onClick={() => setSelectedId(version.id)}
                    className={`w-full p-4 text-left flex flex-col gap-1.5 transition-colors ${
                      isSelected
                        ? "bg-indigo-950/20 border-l-2 border-indigo-500"
                        : "hover:bg-zinc-900/40 border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-white truncate max-w-[150px]">
                        {version.label || (version.isAutoSave ? "Auto-save" : "Manual Save")}
                      </span>
                      <span
                        className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                          version.isAutoSave
                            ? "bg-zinc-900 border border-zinc-800 text-zinc-400"
                            : "bg-indigo-950 border border-indigo-900/50 text-indigo-400"
                        }`}
                      >
                        {version.isAutoSave ? "Auto" : "Manual"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <Calendar className="h-3 w-3 text-zinc-600" />
                      <span>{formatDate(version.createdAt)}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-zinc-600" />
                        <span className="truncate max-w-[100px]">{authorName}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3 text-zinc-600" />
                        <span>{formatBytes(version.sizeBytes)}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Main Content - Preview Area */}
        <main className="flex-1 flex flex-col bg-zinc-950 p-6 overflow-y-auto">
          {selectedId ? (
            <div className="max-w-4xl w-full mx-auto flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div className="flex flex-col gap-1">
                  <h1 className="text-lg font-bold text-white">
                    {selectedVersion?.label ||
                      (selectedVersion?.isAutoSave ? "Auto-saved Snapshot" : "Manual Snapshot")}
                  </h1>
                  <p className="text-xs text-zinc-400">
                    Saved on {selectedVersion && formatDate(selectedVersion.createdAt)} by{" "}
                    <span className="text-zinc-300 font-medium">
                      {selectedVersion?.createdBy.name || selectedVersion?.createdBy.email}
                    </span>
                  </p>
                </div>
                <div className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full font-semibold">
                  Size: {selectedVersion && formatBytes(selectedVersion.sizeBytes)}
                </div>
              </div>

              {loadingSnapshot ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-500 gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                  <span className="text-sm font-medium">
                    Decoding snapshot & applying Yjs updates…
                  </span>
                </div>
              ) : selectedSnapshot ? (
                <VersionPreview key={selectedId} snapshotBase64={selectedSnapshot} />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[400px] text-red-400 gap-2">
                  <AlertCircle className="h-6 w-6" />
                  <span className="text-sm">Could not load preview.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-3 min-h-[400px]">
              <Clock className="h-10 w-10 text-zinc-700 animate-pulse" />
              <span className="text-sm font-medium">
                Select a version from the timeline to preview.
              </span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
