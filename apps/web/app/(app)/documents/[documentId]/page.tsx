import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { assertRole } from "@/lib/permissions";
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

  try {
    // Assert at least VIEWER role
    await assertRole(session.user.id, documentId, "VIEWER");
  } catch {
    // If forbidden, redirect to documents list
    redirect("/documents");
  }

  const currentUser = {
    id: session.user.id,
    email: session.user.email || "",
    name: session.user.name || null,
  };

  return <EditorContentComponent documentId={documentId} currentUser={currentUser} />;
}
