import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/permissions";
import { VersionsContentComponent } from "./versions-content";

export const metadata = {
  title: "Version History | SyncPad",
  description: "View and restore historical versions of your document.",
};

interface PageProps {
  params: Promise<{ documentId: string }>;
}

export default async function VersionsPage({ params }: PageProps) {
  const { documentId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = await getUserRole(session.user.id, documentId);
  if (!role) {
    redirect("/documents");
  }

  const currentUser = {
    id: session.user.id,
    email: session.user.email || "",
    name: session.user.name || null,
  };

  return <VersionsContentComponent documentId={documentId} currentUser={currentUser} role={role} />;
}
