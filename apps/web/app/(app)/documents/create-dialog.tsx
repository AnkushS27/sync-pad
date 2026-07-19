"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { localDb } from "@/lib/local-store/dexie";

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateSuccess: (newDoc: { id: string; title: string }) => void;
  currentUser: {
    id: string;
    email: string;
    name: string | null;
  };
}

export function CreateDialog({
  open,
  onOpenChange,
  onCreateSuccess,
  currentUser,
}: CreateDialogProps) {
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle("Untitled Document");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create document");
      }

      onCreateSuccess(data);
      onOpenChange(false);
    } catch (err: unknown) {
      const isNetworkError = err instanceof TypeError;
      if (!navigator.onLine || isNetworkError) {
        try {
          const localId = "local_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

          await localDb.documentsMeta.add({
            id: localId,
            title,
            ownerId: currentUser.id,
            ownerEmail: currentUser.email,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          await localDb.pendingOps.add({
            documentId: localId,
            timestamp: Date.now(),
            changeType: "create",
            title,
          });

          onCreateSuccess({ id: localId, title });
          onOpenChange(false);
        } catch {
          setError("Failed to create document locally");
        }
      } else {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-zinc-800 text-white rounded-xl shadow-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Create New Document
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Give your document a title. You can invite collaborators and start writing right away.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title" className="text-zinc-300 font-medium">
                Document Title
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="E.g., Quarterly Report"
                disabled={isSubmitting}
                className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-indigo-500 focus-visible:ring-offset-0 placeholder-zinc-500"
              />
            </div>

            {error && (
              <div className="text-sm font-medium text-rose-400 bg-rose-950/30 border border-rose-900/50 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium shadow-md shadow-indigo-900/30 transition-all hover:scale-[1.02]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Document"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
