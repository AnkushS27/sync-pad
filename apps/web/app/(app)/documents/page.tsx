import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardContent } from "./dashboard-content";

export const metadata = {
  title: "Documents | SyncPad",
  description: "Manage your collaborative local-first documents.",
};

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = {
    id: session.user.id,
    email: session.user.email || "",
    name: session.user.name || null,
  };

  return <DashboardContent currentUser={currentUser} />;
}
