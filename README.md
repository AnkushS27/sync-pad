# SyncPad

SyncPad is a local-first, collaborative document editor featuring offline synchronization, deterministic conflict resolution, and granular version control.

This project is structured as a **pnpm monorepo** containing two deployable apps and two shared internal packages.

---

## Repository Structure

```
syncpad/
├── apps/
│   ├── web/                        # Next.js 16 app — UI + REST API + Auth
│   └── sync-server/                # Hocuspocus WebSocket synchronization server
├── packages/
│   ├── db/                         # Prisma schema + generated client singleton
│   └── shared/                     # Shared Zod validation schemas, types, and constants
├── package.json                    # Root scripts and dev dependencies
└── pnpm-workspace.yaml             # pnpm workspace configuration
```

---

## Tech Stack Rationale

- **No Turborepo / pipeline runner:** The monorepo uses native `pnpm workspaces` only. The two apps deploy to separate platforms (e.g., Vercel vs. Railway/Fly) and are run independently during development, so a build pipeline coordinator/cacher isn't needed.
- **Next.js 16 (App Router) & React 19:** Frontend and API server (REST queries, Auth, token minting).
- **Hocuspocus Server:** Dedicated Node WebSocket server hosting the Yjs synchronization engine.
- **Yjs (CRDT) & y-indexeddb:** Conflict-Free Replicated Data Type engine for offline-capable real-time editing.

---

## Local Development Quickstart

### Prerequisites

- Node.js `v24.14.1` (or `>= 20.0.0`)
- pnpm `^8.0.0` or newer

### Installation

1. **Install dependencies:**
   ```bash
   pnpm install
   ```
2. **Configure your environment variables:**
   Copy `.env.example` to `.env` (or create one in `packages/db` and `apps/web` as needed) and configure the variables:
   ```bash
   DATABASE_URL="postgres://..."
   DIRECT_URL="postgres://..."
   AUTH_SECRET="..."
   SYNC_SERVER_URL="ws://localhost:1234"
   SYNC_SERVER_INTERNAL_SECRET="..."
   ```
3. **Generate the Prisma client:**
   ```bash
   pnpm db:generate
   ```

### Running the Applications

Since there is no orchestrated Turborepo pipeline by design, you run the frontend and sync server independently in two separate terminal sessions:

```bash
# Terminal 1: Next.js Frontend
pnpm --filter web dev

# Terminal 2: Sync Server
pnpm --filter sync-server dev
```

---

## Verification and Quality Controls

You can run quality controls from the root workspace:

- **Typecheck all packages:**
  ```bash
  pnpm typecheck
  ```
- **Lint all packages:**
  ```bash
  pnpm lint
  ```
