"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  MoreVertical,
  Share2,
  Trash2,
  Edit2,
  ExternalLink,
  Loader2,
  Check,
  X,
  User,
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

interface DocumentCardProps {
  doc: Document;
  currentUserId: string;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onOpenShare: (doc: Document) => void;
}

export function DocumentCard({
  doc,
  currentUserId,
  onDelete,
  onRename,
  onOpenShare,
}: DocumentCardProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [titleInput, setTitleInput] = React.useState(doc.title);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Determine user's role on this document
  const getUserRole = (): Role => {
    if (doc.ownerId === currentUserId) return "OWNER";
    const collaborator = doc.collaborators.find((c) => c.userId === currentUserId);
    return (collaborator?.role as Role) || "VIEWER";
  };

  const role = getUserRole();
  const isOwner = role === "OWNER";
  const canEdit = role === "OWNER" || role === "EDITOR";

  const handleSaveRename = async () => {
    if (!titleInput.trim()) {
      setTitleInput(doc.title);
      setIsEditing(false);
      return;
    }

    if (titleInput === doc.title) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleInput }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to rename document");
      }

      onRename(doc.id, titleInput);
      setIsEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not rename");
      setTitleInput(doc.title);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelRename = () => {
    setTitleInput(doc.title);
    setIsEditing(false);
    setError(null);
  };

  // Format date nicely
  const formattedDate = new Date(doc.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Color mapping for roles
  const roleBadges = {
    OWNER: "bg-violet-950 text-violet-300 border-violet-800",
    EDITOR: "bg-indigo-950 text-indigo-300 border-indigo-800",
    VIEWER: "bg-zinc-800 text-zinc-400 border-zinc-700",
  };

  return (
    <Card className="group relative bg-zinc-900/60 border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-900/90 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-lg hover:shadow-indigo-950/20 rounded-xl hover:-translate-y-[2px]">
      {/* Background Gradient Hover Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none duration-500" />

      <CardHeader className="p-5 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="p-2 bg-zinc-800/80 rounded-lg text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-950/30 transition-colors border border-zinc-700/50 group-hover:border-indigo-900/30">
            <FileText className="h-5 w-5" />
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-[10px] font-semibold px-2 py-0.5 tracking-wide uppercase ${roleBadges[role]}`}
            >
              {role}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-500 hover:text-white hover:bg-zinc-800"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent
                align="end"
                className="bg-zinc-900 border-zinc-800 text-zinc-300 min-w-[160px]"
              >
                <DropdownMenuItem
                  render={<Link href={`/documents/${doc.id}`} />}
                  className="focus:bg-zinc-800 focus:text-white py-2 flex items-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Editor
                </DropdownMenuItem>

                {canEdit && (
                  <DropdownMenuItem
                    onClick={() => setIsEditing(true)}
                    className="focus:bg-zinc-800 focus:text-white py-2 flex items-center gap-2 cursor-pointer"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Rename
                  </DropdownMenuItem>
                )}

                {isOwner && (
                  <>
                    <DropdownMenuItem
                      onClick={() => onOpenShare(doc)}
                      className="focus:bg-zinc-800 focus:text-white py-2 flex items-center gap-2 cursor-pointer"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Manage Sharing
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-zinc-800" />
                    <DropdownMenuItem
                      onClick={() => onDelete(doc.id)}
                      className="focus:bg-rose-950/55 focus:text-rose-200 text-rose-400 py-2 flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-2 flex-grow">
        {isEditing ? (
          <div className="flex items-center gap-1.5 mt-1">
            <Input
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              className="h-8 py-0 px-2 bg-zinc-800 border-zinc-700 text-sm text-white focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:ring-offset-0"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveRename();
                if (e.key === "Escape") handleCancelRename();
              }}
              disabled={isSaving}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30"
              onClick={handleSaveRename}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
              onClick={handleCancelRename}
              disabled={isSaving}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div>
            <h3 className="font-semibold text-zinc-100 group-hover:text-white transition-colors line-clamp-1 text-base tracking-tight">
              {doc.title}
            </h3>
            {error && <p className="text-[10px] text-rose-400 mt-1 font-medium">{error}</p>}
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-3 text-xs text-zinc-500">
          <User className="h-3.5 w-3.5 text-zinc-600" />
          <span className="truncate">{isOwner ? "You" : doc.owner.name || doc.owner.email}</span>
        </div>
      </CardContent>

      <CardFooter className="p-5 pt-3 border-t border-zinc-800/60 bg-zinc-950/40 rounded-b-xl flex items-center justify-between mt-auto">
        <span className="text-[11px] font-medium text-zinc-400">Updated {formattedDate}</span>

        {/* Collaborators Avatar Stack */}
        <div className="flex -space-x-1.5 overflow-hidden">
          {doc.collaborators.length > 0 ? (
            doc.collaborators.slice(0, 3).map((collab) => {
              const fallback = (collab.user.name || collab.user.email)
                .substring(0, 2)
                .toUpperCase();
              return (
                <Avatar
                  key={collab.userId}
                  className="h-6 w-6 ring-2 ring-zinc-900 border border-zinc-700/60"
                >
                  <AvatarFallback className="text-[9px] font-bold bg-zinc-800 text-zinc-200">
                    {fallback}
                  </AvatarFallback>
                </Avatar>
              );
            })
          ) : (
            <div className="flex items-center text-[10px] text-zinc-500 gap-1 select-none">
              Private
            </div>
          )}
          {doc.collaborators.length > 3 && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-bold text-zinc-300 ring-2 ring-zinc-900 select-none">
              +{doc.collaborators.length - 3}
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
