import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sparkles, ArrowRight, Shield, Zap, RefreshCw } from "lucide-react";

export default async function Home() {
  const session = await auth();

  // If already logged in, redirect directly to dashboard
  if (session?.user?.id) {
    redirect("/documents");
  }

  return (
    <div className="flex flex-col min-h-screen bg-black text-zinc-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background Gradients */}
      <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-indigo-600/10 rounded-full filter blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[350px] h-[350px] bg-violet-600/10 rounded-full filter blur-[100px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="w-full border-b border-zinc-900 bg-zinc-950/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              SyncPad
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center relative z-10 max-w-4xl mx-auto space-y-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-950/30 border border-indigo-900/50 rounded-full text-xs font-medium text-indigo-300">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          <span>Local‑First Collaborative Document Editor</span>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.1] bg-gradient-to-b from-white via-zinc-100 to-zinc-500 bg-clip-text text-transparent">
            Write seamlessly.
            <br />
            Collaborate anywhere.
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 max-w-xl mx-auto leading-relaxed">
            A state-of-the-art document editor designed with local-first persistence, real-time
            sync, and robust conflict resolution. Offline capability is built-in.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/register"
            className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-lg shadow-lg shadow-indigo-900/30 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            Create Free Account
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-semibold rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all flex items-center justify-center"
          >
            Sign In
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-16 w-full text-left">
          <div className="p-5 bg-zinc-950/50 border border-zinc-900 rounded-xl space-y-3">
            <div className="p-2 bg-indigo-950/40 text-indigo-400 border border-indigo-900/30 rounded-lg w-fit">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-white text-sm">Local-First Speed</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Open, edit, and close documents with zero network blocking. Your edits persist locally
              first.
            </p>
          </div>

          <div className="p-5 bg-zinc-950/50 border border-zinc-900 rounded-xl space-y-3">
            <div className="p-2 bg-violet-950/40 text-violet-400 border border-violet-900/30 rounded-lg w-fit">
              <RefreshCw className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-white text-sm">Real-time Sync</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Connect to our real-time sync server for seamless, conflict-free collaborative writing
              sessions.
            </p>
          </div>

          <div className="p-5 bg-zinc-950/50 border border-zinc-900 rounded-xl space-y-3">
            <div className="p-2 bg-zinc-900 text-zinc-400 border border-zinc-850 rounded-lg w-fit">
              <Shield className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-white text-sm">Granular Security</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Defense-in-depth permission checking and database-level security policies protect your
              work.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-zinc-900 py-8 text-center text-xs text-zinc-600 bg-black">
        <p>© {new Date().getFullYear()} SyncPad. All rights reserved.</p>
      </footer>
    </div>
  );
}
