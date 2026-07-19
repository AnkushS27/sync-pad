"use client";

import * as React from "react";
import Link from "next/link";
import * as Y from "yjs";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { LocalDocumentStore } from "@/lib/local-store/repository";
import { localDb } from "@/lib/local-store/dexie";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  WifiOff,
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
} from "lucide-react";

interface EditorContentComponentProps {
  documentId: string;
  currentUser: {
    id: string;
    email: string;
    name: string | null;
  };
}

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
`;

export function EditorContentComponent({ documentId }: EditorContentComponentProps) {
  const [title, setTitle] = React.useState("Loading document...");

  // Open the document session and retrieve the Y.Doc and IndexedDB provider
  const { ydoc } = React.useMemo(() => {
    if (typeof window === "undefined") {
      return { ydoc: new Y.Doc() };
    }
    return LocalDocumentStore.openDocument(documentId);
  }, [documentId]);

  // Clean up session on unmount
  React.useEffect(() => {
    return () => {
      LocalDocumentStore.closeDocument(documentId);
    };
  }, [documentId]);

  // Load title from local cache and try to sync from server
  React.useEffect(() => {
    let active = true;

    async function loadTitle() {
      // 1. Instantly read from Dexie cache
      const cached = await localDb.documentsMeta.get(documentId);
      if (cached && active) {
        setTitle(cached.title);
      }

      // 2. Fetch from network in background
      try {
        const res = await fetch(`/api/documents/${documentId}`);
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setTitle(data.title);
            // Update cache title
            if (cached) {
              await localDb.documentsMeta.update(documentId, { title: data.title });
            }
          }
        }
      } catch {
        console.log("Offline or network failed, using cached title.");
      }
    }

    loadTitle();

    return () => {
      active = false;
    };
  }, [documentId]);

  // Configure Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Collaboration manages its own history (undo/redo stack)
        undoRedo: false,
      }),
      Collaboration.configure({
        document: ydoc,
        field: "default",
      }),
    ],
    editorProps: {
      attributes: {
        class: "focus:outline-none max-w-none min-h-[550px]",
      },
    },
    immediatelyRender: false,
  });

  if (!editor) {
    return (
      <div className="flex-1 flex flex-col bg-black min-h-screen text-zinc-100 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Database className="h-8 w-8 text-zinc-500 animate-pulse" />
          <span className="text-sm text-zinc-500 font-medium">Initializing Local Database...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-black min-h-screen text-zinc-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      <style>{editorStyles}</style>

      {/* Editor Top Navigation */}
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
              <span className="text-[10px] text-zinc-500 truncate">Saved in local database</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-950/20 border border-yellow-900/30 rounded-full text-[10px] font-semibold text-yellow-500">
              <WifiOff className="h-3 w-3" />
              <span>Offline (Local-Only)</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-[10px] font-semibold text-zinc-400">
              <Database className="h-3 w-3 text-zinc-500" />
              <span>Cache Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* Format Toolbar */}
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

      {/* Editor Content Area */}
      <main className="flex-grow max-w-4xl w-full mx-auto px-4 py-8">
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl shadow-xl min-h-[600px]">
          <EditorContent editor={editor} />
        </div>
      </main>
    </div>
  );
}
