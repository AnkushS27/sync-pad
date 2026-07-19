"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { Role } from "@syncpad/shared";

interface Collaborator {
  userId: string;
  role: Role;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
}

export function ShareDialog({ open, onOpenChange, documentId, documentTitle }: ShareDialogProps) {
  const [collaborators, setCollaborators] = React.useState<Collaborator[]>([]);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("VIEWER");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchCollaborators = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch document details");
      }
      const data = await res.json();
      setCollaborators(data.collaborators || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load collaborators");
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  React.useEffect(() => {
    if (open && documentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchCollaborators();
      setEmail("");
      setRole("VIEWER");
      setError(null);
    }
  }, [open, documentId, fetchCollaborators]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to invite collaborator");
      }

      setEmail("");
      // Refresh the list
      await fetchCollaborators();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to invite collaborator");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (targetUserId: string, newRole: Role) => {
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/collaborators`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, role: newRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update collaborator role");
      }

      await fetchCollaborators();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleRemoveCollaborator = async (targetUserId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/collaborators`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove collaborator");
      }

      await fetchCollaborators();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove collaborator");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800 text-white rounded-xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 border-b border-zinc-800">
          <DialogTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-400" />
            Share &quot;{documentTitle}&quot;
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            Invite collaborators to view or edit this document.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Invite Form */}
          <form onSubmit={handleInvite} className="space-y-3">
            <Label className="text-zinc-300 font-medium text-xs uppercase tracking-wider">
              Add Collaborator
            </Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="collaborator@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-indigo-500 focus-visible:ring-offset-0 placeholder-zinc-500"
                  required
                />
              </div>
              <Select
                value={role}
                onValueChange={(val) => setRole(val as Role)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="w-[110px] bg-zinc-800 border-zinc-700 text-white focus:ring-indigo-500 focus:ring-offset-0">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectItem value="VIEWER" className="focus:bg-zinc-700 focus:text-white">
                    Viewer
                  </SelectItem>
                  <SelectItem value="EDITOR" className="focus:bg-zinc-700 focus:text-white">
                    Editor
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/50"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>

          {error && (
            <div className="text-sm font-medium text-rose-400 bg-rose-950/30 border border-rose-900/50 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Collaborator List */}
          <div className="space-y-3">
            <Label className="text-zinc-300 font-medium text-xs uppercase tracking-wider">
              Who has access
            </Label>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
              </div>
            ) : collaborators.length === 0 ? (
              <div className="text-sm text-zinc-500 italic py-2 text-center bg-zinc-800/30 border border-dashed border-zinc-800 rounded-lg">
                No external collaborators. This document is private to you.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/50">
                {collaborators.map((c) => {
                  const initial = c.user.email.substring(0, 2).toUpperCase();
                  return (
                    <div key={c.userId} className="flex items-center justify-between p-3 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8 bg-indigo-950 text-indigo-300 border border-indigo-900">
                          <AvatarFallback className="text-xs font-semibold bg-indigo-950 text-indigo-200">
                            {initial}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">
                            {c.user.name || c.user.email}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">{c.user.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Select
                          value={c.role}
                          onValueChange={(val) => handleUpdateRole(c.userId, val as Role)}
                        >
                          <SelectTrigger className="w-[100px] h-8 bg-zinc-800/50 border-zinc-800 text-xs text-zinc-300 focus:ring-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                            <SelectItem
                              value="VIEWER"
                              className="text-xs focus:bg-zinc-700 focus:text-white"
                            >
                              Viewer
                            </SelectItem>
                            <SelectItem
                              value="EDITOR"
                              className="text-xs focus:bg-zinc-700 focus:text-white"
                            >
                              Editor
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveCollaborator(c.userId)}
                          className="h-8 w-8 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
