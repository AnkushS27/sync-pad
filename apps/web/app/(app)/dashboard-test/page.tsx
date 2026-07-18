import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardTestPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-8 shadow-xl text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
          Dashboard Test Page
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6">You are successfully authenticated!</p>
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 p-4 mb-6 text-left border border-zinc-200 dark:border-zinc-800">
          <p className="text-xs text-zinc-400 uppercase font-semibold mb-1">User ID</p>
          <p className="text-sm font-mono text-zinc-800 dark:text-zinc-200 truncate">
            {session.user.id}
          </p>
          <p className="text-xs text-zinc-400 uppercase font-semibold mt-4 mb-1">Email</p>
          <p className="text-sm text-zinc-800 dark:text-zinc-200">{session.user.email}</p>
          {session.user.name && (
            <>
              <p className="text-xs text-zinc-400 uppercase font-semibold mt-4 mb-1">Name</p>
              <p className="text-sm text-zinc-800 dark:text-zinc-200">{session.user.name}</p>
            </>
          )}
        </div>
        <form action={handleSignOut}>
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-50 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 shadow transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200"
          >
            Sign Out
          </button>
        </form>
      </div>
    </div>
  );
}
