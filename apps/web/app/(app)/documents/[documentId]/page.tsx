import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/permissions";
import { EditorContentComponent } from "./editor-content";

export const metadata = {
  title: "Editor | SyncPad",
  description: "Edit your document in real-time or offline.",
};

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Determine the user's role — getUserRole returns null if no access at all.
  const role = await getUserRole(session.user.id, documentId);

  if (!role) {
    // User has no relation to this document — redirect to dashboard.
    redirect("/documents");
  }

  const currentUser = {
    id: session.user.id,
    email: session.user.email || "",
    name: session.user.name || null,
  };

  return (
    <EditorContentComponent
      key={documentId}
      documentId={documentId}
      currentUser={currentUser}
      role={role}
    />
  );
}
