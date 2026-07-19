"use client";

import * as React from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CreateDialog } from "./create-dialog";
import { ShareDialog } from "./share-dialog";
import { DocumentCard } from "./document-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  LogOut,
  FolderOpen,
  User,
  Users,
  Grid,
  List,
  Sparkles,
  FileText,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Role } from "@syncpad/shared";

interface Collaborator {
  userId: string;
  role: Role;
  user: {
    name: string | null;
    email: string;
  };
}

interface Document {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string | null;
    email: string;
  };
  collaborators: Collaborator[];
}

interface DashboardContentProps {
  currentUser: {
    id: string;
    email: string;
    name: string | null;
  };
}

export function DashboardContent({ currentUser }: DashboardContentProps) {
  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "owned" | "shared">("all");
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");

  // Dialog states
  const [createOpen, setCreateOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [activeShareDoc, setActiveShareDoc] = React.useState<Document | null>(null);

  // Delete modal states
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) {
        throw new Error("Failed to fetch documents");
      }
      const data = await res.json();
      setDocuments(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred while fetching documents");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDocuments();
  }, []);

  const handleCreateSuccess = () => {
    // Re-fetch documents to get complete structure (including owner details)
    fetchDocuments();
  };

  const handleRename = (id: string, newTitle: string) => {
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, title: newTitle } : doc)));
  };

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documents/${deleteId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete document");
      }

      setDocuments((prev) => prev.filter((doc) => doc.id !== deleteId));
      setDeleteId(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete document");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenShare = (doc: Document) => {
    setActiveShareDoc(doc);
    setShareOpen(true);
  };

  // Filtered documents
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());

    if (filter === "owned") {
      return matchesSearch && doc.ownerId === currentUser.id;
    }
    if (filter === "shared") {
      return matchesSearch && doc.ownerId !== currentUser.id;
    }
    return matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col bg-black min-h-screen text-zinc-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              SyncPad
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-xs text-zinc-400">
              <User className="h-3.5 w-3.5 text-zinc-500" />
              <span>{currentUser.email}</span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="h-9 w-9 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/20 border border-zinc-800 hover:border-rose-900/30"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Banner Section */}
      <div className="relative overflow-hidden bg-zinc-950 border-b border-zinc-900 py-8 sm:py-12">
        <div className="absolute top-0 right-1/4 w-[300px] h-[300px] bg-indigo-600/10 rounded-full filter blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-[250px] h-[250px] bg-violet-600/10 rounded-full filter blur-[80px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Workspace
              </h1>
              <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
                Create new document nodes, collaborate in real time with colleagues, or continue
                working offline without interruptions.
              </p>
            </div>

            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-indigo-900/30 transition-all hover:scale-[1.02] active:scale-[0.98] h-11 px-5 rounded-lg flex items-center gap-2 self-start sm:self-auto"
            >
              <Plus className="h-5 w-5" />
              New Document
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Controls Panel */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/30 p-4 rounded-xl border border-zinc-900/80 backdrop-blur-sm">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 text-white focus-visible:ring-indigo-500 focus-visible:ring-offset-0 placeholder-zinc-500 h-10"
            />
          </div>

          {/* Filtering buttons */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center bg-zinc-900 p-1 border border-zinc-800 rounded-lg">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilter("all")}
                className={`h-8 px-3 rounded-md text-xs font-semibold transition-all ${
                  filter === "all"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilter("owned")}
                className={`h-8 px-3 rounded-md text-xs font-semibold transition-all ${
                  filter === "owned"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Owned by me
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilter("shared")}
                className={`h-8 px-3 rounded-md text-xs font-semibold transition-all ${
                  filter === "shared"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Shared with me
              </Button>
            </div>

            <div className="hidden sm:flex items-center bg-zinc-900 p-1 border border-zinc-800 rounded-lg">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode("grid")}
                className={`h-8 w-8 rounded-md transition-all ${
                  viewMode === "grid"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode("list")}
                className={`h-8 w-8 rounded-md transition-all ${
                  viewMode === "list"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Errors Alert */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-rose-950/20 border border-rose-900/50 rounded-xl text-rose-300">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-400" />
            <p className="text-sm font-medium">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDocuments}
              className="ml-auto bg-rose-900/10 hover:bg-rose-900/20 text-rose-300 border-rose-800/50 h-8"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-[170px] bg-zinc-900/40 border border-zinc-800/60 rounded-xl animate-pulse flex flex-col justify-between p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="h-9 w-9 bg-zinc-800 rounded-lg" />
                  <div className="h-5 w-16 bg-zinc-800 rounded-full" />
                </div>
                <div className="h-5 w-2/3 bg-zinc-800 rounded mt-4" />
                <div className="flex justify-between items-center mt-6">
                  <div className="h-3 w-20 bg-zinc-800 rounded" />
                  <div className="h-6 w-12 bg-zinc-800 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredDocs.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center text-center p-12 py-20 bg-zinc-900/10 border border-dashed border-zinc-800 rounded-2xl max-w-lg mx-auto space-y-4">
            <div className="p-4 bg-zinc-900 rounded-full text-zinc-500 border border-zinc-800">
              <FolderOpen className="h-8 w-8 text-zinc-400" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-white text-base">No documents found</h3>
              <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                {searchQuery
                  ? "No results matched your search queries. Try search for another term."
                  : "Start creating your first offline-first collaborative document to begin your journey."}
              </p>
            </div>
            {!searchQuery && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-md shadow-indigo-950/50"
              >
                Create Document
              </Button>
            )}
          </div>
        ) : viewMode === "list" ? (
          /* List view */
          <div className="border border-zinc-900 bg-zinc-950 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-900/50">
                    <th className="p-4 pl-6">Title</th>
                    <th className="p-4">Owner</th>
                    <th className="p-4">Collaborators</th>
                    <th className="p-4">Last Updated</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {filteredDocs.map((doc) => {
                    const isDocOwner = doc.ownerId === currentUser.id;
                    return (
                      <tr key={doc.id} className="hover:bg-zinc-900/30 group transition-colors">
                        <td className="p-4 pl-6 font-medium text-white flex items-center gap-3">
                          <FileText className="h-4 w-4 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                          <Link
                            href={`/documents/${doc.id}`}
                            className="hover:underline line-clamp-1"
                          >
                            {doc.title}
                          </Link>
                        </td>
                        <td className="p-4 text-zinc-400 text-sm">
                          {isDocOwner ? "You" : doc.owner.name || doc.owner.email}
                        </td>
                        <td className="p-4 text-zinc-400 text-sm">
                          <div className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5 text-zinc-600" />
                            <span>{doc.collaborators.length}</span>
                          </div>
                        </td>
                        <td className="p-4 text-zinc-500 text-xs">
                          {new Date(doc.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="p-4 pr-6 text-right space-x-1">
                          <Link
                            href={`/documents/${doc.id}`}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "sm" }),
                              "h-8 text-zinc-400 hover:text-white hover:bg-zinc-800",
                            )}
                          >
                            Open
                          </Link>
                          {isDocOwner && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenShare(doc)}
                              className="h-8 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-950/20"
                            >
                              Share
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Grid view */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                currentUserId={currentUser.id}
                onDelete={handleDeleteClick}
                onRename={handleRename}
                onOpenShare={handleOpenShare}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating create dialog */}
      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateSuccess={handleCreateSuccess}
      />

      {/* Floating share dialog */}
      {activeShareDoc && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          documentId={activeShareDoc.id}
          documentTitle={activeShareDoc.title}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[400px] bg-zinc-900 border-zinc-800 text-white rounded-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight text-rose-400 flex items-center gap-2">
              Delete Document
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete this document? This action is irreversible and all
              document contents and collaborators will be removed.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteId(null)}
              disabled={isDeleting}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-500 text-white font-medium shadow-md shadow-rose-950/50"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
