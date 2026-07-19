# SyncPad — Implementation Plan for Claude Code

**Project:** Local‑First Collaborative Document Editor (House of Edtech — Fullstack Assignment 2)
**Placeholder name:** `SyncPad` — rename freely, it's used only for `package.json` / repo naming below.
**Audience for this document:** Claude Code (or any coding agent) executing the build, phase by phase, inside your own repo/machine.

---

## 0. How to use this document

This plan is split into **13 phases (Phase 0 → Phase 12)**. Each phase is a self‑contained unit of work:

- **Goal** — what the phase achieves and why it exists.
- **Tasks** — concrete, ordered steps. Follow them in order; don't jump ahead.
- **Key files** — the files/modules you should end up with.
- **Acceptance criteria** — a checklist. A phase is not "done" until every box is true. Run it, don't assume it.
- **Notes & gotchas** — traps specific to this stack/version that will waste time if missed.

**Rules for the agent doing the build:**

1. Work one phase at a time. After finishing a phase, run `pnpm typecheck && pnpm lint` at the repo root, fix everything, then run the phase's acceptance criteria before moving on.
2. Commit at the end of every phase with a message like `feat(phase-3): local-first storage layer`. Small, reviewable commits — never one giant commit at the end.
3. Never invent a requirement that contradicts this doc, but you may ask (in a code comment `// DECISION:`) when something is genuinely ambiguous, and pick the most defensible option yourself rather than stalling.
4. Prefer editing/extending the shared packages (`packages/db`, `packages/shared`) over duplicating types between `apps/web` and `apps/sync-server`.
5. Every mutation-capable API route and every WebSocket hook must assume the caller is hostile. Validate first, trust nothing from the wire.
6. This is an assignment meant to demonstrate senior-level engineering judgment — favor a smaller number of well-reasoned, well-tested subsystems over a large number of shallow ones. Depth on the sync engine, version control, and security sections matters more than breadth of UI polish.

---

## 1. Final Tech Stack

| Layer                       | Choice                                                                                                                                                                                          | Why (short)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo tooling            | pnpm workspaces only (no Turborepo)                                                                                                                                                             | Two deployable apps (`web`, `sync-server`) + shared packages need a real workspace graph, which pnpm workspaces already provides on its own. No build-orchestration/caching tool is layered on top: the two apps deploy to entirely separate targets (Vercel vs. Railway/Fly) and are run independently during development, so a shared pipeline runner doesn't earn its keep here — it would add a config surface without a problem it's solving.  |
| Frontend/Backend framework  | Next.js 16 (App Router, Turbopack default, TypeScript)                                                                                                                                          | Mandated. Uses Cache Components (`"use cache"`), `proxy.ts` (renamed from `middleware.ts` in v16), async `params`/`searchParams`.                                                                                                                                                                                                                                                                                                                   |
| UI                          | React 19.2 (via Next 16), Tailwind CSS v4, shadcn/ui (Radix primitives)                                                                                                                         | Mandated. Accessible by default via Radix.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Editor                      | Tiptap 3.x (ProseMirror-based)                                                                                                                                                                  | Headless, extensible, first-class Yjs collaboration integration.                                                                                                                                                                                                                                                                                                                                                                                    |
| Local-first CRDT engine     | Yjs + `y-indexeddb` (browser)                                                                                                                                                                   | Deterministic, commutative, associative, idempotent merge — this _is_ "deterministic conflict resolution," not something we bolt on top.                                                                                                                                                                                                                                                                                                            |
| Local app-metadata store    | Dexie.js (IndexedDB wrapper)                                                                                                                                                                    | Document list cache, sync/version metadata, offline queue bookkeeping — separate from the raw CRDT log.                                                                                                                                                                                                                                                                                                                                             |
| Real-time transport/backend | Self-hosted **Hocuspocus** (`@hocuspocus/server`, open-source, Node 22+)                                                                                                                        | Purpose-built Yjs WebSocket backend (same team as Tiptap). We self-host it (not the paid Tiptap Cloud) so persistence, auth, and data stay in our own Postgres. Reusing it for wire-protocol plumbing is the same judgment call as "use Next.js, don't write your own HTTP server" — it lets engineering effort go into the parts that are actually ours: auth hooks, persistence hooks, validation, rate limiting, version control, audit logging. |
| Database                    | PostgreSQL via **Prisma Postgres** (managed) + Prisma ORM                                                                                                                                       | Mandated (Postgres). Prisma Postgres gives built-in connection pooling (via bundled PgBouncer) and scale-to-zero, which matters because both `apps/web` (serverless) and `apps/sync-server` (long-lived) hit the same DB from very different connection patterns.                                                                                                                                                                                   |
| Auth                        | Auth.js v5 (`next-auth@5`), Credentials provider, JWT sessions                                                                                                                                  | Mandated (NextAuth, credentials-based). JWT (not DB) sessions because `apps/web` runs on serverless/edge.                                                                                                                                                                                                                                                                                                                                           |
| Password hashing            | `bcryptjs` (pure JS, not native `bcrypt`)                                                                                                                                                       | Native `bcrypt` breaks in edge/serverless bundling; `bcryptjs` doesn't.                                                                                                                                                                                                                                                                                                                                                                             |
| Validation                  | Zod (shared schemas in `packages/shared`)                                                                                                                                                       | Both REST payloads and Hocuspocus hook payloads validate through the same schemas.                                                                                                                                                                                                                                                                                                                                                                  |
| Client server-state cache   | TanStack Query                                                                                                                                                                                  | Document list, collaborator list, version list — anything fetched over REST.                                                                                                                                                                                                                                                                                                                                                                        |
| Client local/UI state       | Zustand                                                                                                                                                                                         | Editor UI state, connection status, presence — kept separate from TanStack Query's server cache.                                                                                                                                                                                                                                                                                                                                                    |
| PWA                         | **Serwist** (`@serwist/next`), not `next-pwa`                                                                                                                                                   | `next-pwa` requires Webpack; Next.js 16 defaults to Turbopack. Serwist works with it.                                                                                                                                                                                                                                                                                                                                                               |
| AI features                 | Vercel AI SDK (`ai` package) with a provider abstraction (Groq / OpenAI / Gemini via env var)                                                                                                   | "Good to have." Kept behind a feature flag so the app fully works with zero AI keys configured.                                                                                                                                                                                                                                                                                                                                                     |
| Testing                     | Vitest (unit/integration), Playwright (E2E, incl. multi-context convergence tests)                                                                                                              | —                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Rate limiting (REST)        | Upstash Ratelimit (Redis-backed, serverless-friendly)                                                                                                                                           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Rate limiting (WS)          | `@hocuspocus/extension-throttle` + custom payload-size hooks                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| CI/CD                       | GitHub Actions                                                                                                                                                                                  | Lint/typecheck/test on PR, migrate+deploy on merge to `main`.                                                                                                                                                                                                                                                                                                                                                                                       |
| Hosting                     | `apps/web` → Vercel. `apps/sync-server` → Railway or Fly.io (Docker, long-lived process) — Prisma Compute is a valid alternative since it colocates with Prisma Postgres. DB → Prisma Postgres. | Next.js serverless functions cannot hold a persistent WebSocket connection, so the realtime layer must run somewhere else.                                                                                                                                                                                                                                                                                                                          |

---

## 2. Repository Structure

```
syncpad/
├── apps/
│   ├── web/                        # Next.js 16 app — UI + REST API + Auth
│   │   ├── app/
│   │   │   ├── (marketing)/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   └── register/
│   │   │   ├── (app)/
│   │   │   │   ├── documents/
│   │   │   │   │   ├── page.tsx            # dashboard/list
│   │   │   │   │   └── [documentId]/
│   │   │   │   │       ├── page.tsx        # editor
│   │   │   │   │       └── versions/page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── api/
│   │   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   │   ├── documents/route.ts
│   │   │   │   ├── documents/[id]/route.ts
│   │   │   │   ├── documents/[id]/collaborators/route.ts
│   │   │   │   ├── documents/[id]/versions/route.ts
│   │   │   │   ├── documents/[id]/versions/[versionId]/restore/route.ts
│   │   │   │   ├── documents/[id]/token/route.ts   # short-lived WS auth token
│   │   │   │   └── ai/[...feature]/route.ts
│   │   │   ├── manifest.ts                 # PWA manifest (Next.js native)
│   │   │   ├── sw.ts                       # Serwist service worker source
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── editor/
│   │   │   ├── dashboard/
│   │   │   ├── versions/
│   │   │   └── ui/                         # shadcn components
│   │   ├── lib/
│   │   │   ├── auth.config.ts              # edge-safe Auth.js config
│   │   │   ├── auth.ts                     # full Auth.js config (bcrypt etc, Node runtime)
│   │   │   ├── local-store/                # Dexie + y-indexeddb abstraction
│   │   │   ├── sync/                       # HocuspocusProvider wiring, connection state machine
│   │   │   ├── permissions.ts              # shared-with-server role logic (client mirror)
│   │   │   └── rate-limit.ts
│   │   ├── proxy.ts                        # route protection (Next 16 name for middleware.ts)
│   │   └── next.config.ts
│   │
│   └── sync-server/                        # Hocuspocus WebSocket backend
│       ├── src/
│       │   ├── index.ts                    # server bootstrap
│       │   ├── hooks/
│       │   │   ├── authenticate.ts
│       │   │   ├── load-document.ts
│       │   │   ├── store-document.ts
│       │   │   ├── change.ts
│       │   │   └── connect-disconnect.ts
│       │   ├── persistence/
│       │   │   └── postgres-store.ts       # implements extension-database's fetch()/store()
│       │   ├── security/
│       │   │   ├── payload-limits.ts
│       │   │   └── audit-log.ts
│       │   └── config.ts
│       └── Dockerfile
│
├── packages/
│   ├── db/                                 # Prisma schema + generated client, shared by both apps
│   │   ├── prisma/schema.prisma
│   │   ├── prisma.config.ts
│   │   └── src/index.ts                    # exported PrismaClient singleton
│   └── shared/                             # Zod schemas, enums, constants, protocol types
│       └── src/
│           ├── schemas/
│           ├── constants.ts                # size limits, role enum, rate-limit windows
│           └── types.ts
│
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
├── pnpm-workspace.yaml
├── package.json          # root scripts fan out to workspaces via `pnpm -r` / `pnpm --filter`
└── README.md
```

---

## 3. Environment Variables

Create `.env.example` at the repo root and per-app `.env` files that reference these:

```bash
# --- Database (packages/db, apps/web, apps/sync-server) ---
DATABASE_URL="prisma+postgres://..."          # Prisma Postgres connection string (pooled)
DIRECT_URL="postgres://..."                    # Direct connection, used only for migrations

# --- Auth.js (apps/web) ---
AUTH_SECRET="..."                              # openssl rand -base64 33
AUTH_URL="http://localhost:3000"

# --- Sync server (apps/web + apps/sync-server) ---
SYNC_SERVER_URL="ws://localhost:1234"          # apps/web -> client-side WS target
SYNC_SERVER_INTERNAL_SECRET="..."              # HMAC secret so sync-server can verify tokens minted by apps/web

# --- Rate limiting ---
UPSTASH_REDIS_REST_URL="..."
UPSTASH_REDIS_REST_TOKEN="..."

# --- AI (optional — app must run fully without these) ---
AI_PROVIDER="groq"                             # groq | openai | gemini | none
GROQ_API_KEY=""
OPENAI_API_KEY=""
GOOGLE_GENERATIVE_AI_API_KEY=""

# --- Misc ---
NODE_ENV="development"
MAX_DOCUMENT_SIZE_BYTES="5000000"              # 5MB encoded Yjs state ceiling
MAX_WS_MESSAGE_BYTES="1000000"                 # 1MB per WS frame ceiling
```

**Note on the WS auth token:** the browser cannot safely hold a long-lived DB credential, and Hocuspocus's `onAuthenticate` hook only gets whatever `token` the client provider sends. So `apps/web` exposes `GET /api/documents/[id]/token`, which (a) checks the caller's session, (b) checks their role on that document, (c) mints a short-lived (60s) signed token (JWT signed with `SYNC_SERVER_INTERNAL_SECRET`) containing `{ userId, documentId, role, exp }`, and (d) the client passes that token into `HocuspocusProvider({ token })`. `sync-server`'s `onAuthenticate` hook verifies the signature and expiry — it never talks to NextAuth directly.

---

## Phase 0 — Monorepo Foundations

**Goal:** A clean, empty-but-wired monorepo that builds, lints, and typechecks.

**Tasks:**

1. `pnpm init` at root; add `pnpm-workspace.yaml` covering `apps/*` and `packages/*`. No Turborepo, no other build-orchestration tool — pnpm's own workspace/recursive-run features are enough for a two-app project, and the two apps deploy independently anyway (see §1 rationale).
2. Root `package.json` scripts that fan out across workspaces using pnpm's built-in recursive flags — no extra dependency needed:
   ```json
   {
     "scripts": {
       "lint": "pnpm -r run lint",
       "typecheck": "pnpm -r run typecheck",
       "test": "pnpm -r run test",
       "build": "pnpm -r run build",
       "db:migrate": "pnpm --filter @syncpad/db run migrate",
       "db:studio": "pnpm --filter @syncpad/db run studio",
       "db:generate": "pnpm --filter @syncpad/db run generate"
     }
   }
   ```
   Each workspace package (`apps/web`, `apps/sync-server`, `packages/db`, `packages/shared`) defines its own `lint`/`typecheck`/`test`/`build` scripts that these root commands delegate to. There is deliberately **no** root `dev` script that launches both apps at once — see the note below.
3. Scaffold `apps/web` with `create-next-app@latest` — TypeScript, Tailwind, App Router, `src/` off (keep `app/` at app root for simplicity), import alias `@/*`.
4. Scaffold `apps/sync-server` as a plain TypeScript Node project (`tsx` for dev, `tsc` for build; Node 22 target).
5. Scaffold `packages/db` and `packages/shared` as internal workspace packages (`"name": "@syncpad/db"`, `"@syncpad/shared"`), consumed via `workspace:*` in the two apps.
6. Root-level ESLint (flat config) + Prettier, shared across all packages. Husky + `lint-staged` pre-commit hook running `lint` and `typecheck` on staged files.
7. Root `README.md` stub (real content comes from `PROJECT_DOCUMENTATION.md` — copy/adapt sections in as you build, don't leave it empty). Include the two-terminal dev instructions from the note below.
8. `.gitignore` (node_modules, `.next`, `dist`, `.env*.local`).

**Note on running both apps in development:** since there's no orchestration tool, run them independently, in two terminals:

```bash
# terminal 1
pnpm --filter web dev
# terminal 2
pnpm --filter sync-server dev
```

This is intentional, not a gap — the two apps have nothing to coordinate about at dev-server-startup time (no shared build step between them beyond `packages/db`/`packages/shared`, which each app's own `dev` script should depend on via a `pretsx`/`predev` local script, e.g. `pnpm --filter @syncpad/db run generate` before either app starts). Document this clearly in the README so it's not a surprise.

**Acceptance criteria:**

- [x] `pnpm install` succeeds from repo root.
- [x] `pnpm --filter web dev` (in one terminal) boots a default Next.js page.
- [x] `pnpm --filter sync-server dev` (in a second terminal) boots a "hello" TS process with no errors, independently of whether `web` is running.
- [x] `pnpm lint` and `pnpm typecheck` (the root scripts from step 2) run across all workspaces from root with zero errors.
- [x] Husky pre-commit hook actually fires on a test commit.

---

## Phase 1 — Database Schema & Prisma Postgres

**Goal:** The full data model exists, migrated, and typed — before any feature code touches it.

**Tasks:**

1. In `packages/db`, run `prisma init` (this generates `prisma.config.ts` automatically on current Prisma versions — keep it, it's the forward-compatible config surface for Prisma 7).
2. Provision a Prisma Postgres database (`prisma init --db` or via Prisma Console) for local dev; get `DATABASE_URL` (pooled) and `DIRECT_URL` (for migrate).
3. Write `schema.prisma` using the model in **Appendix A** below verbatim (adjust only if a later phase surfaces a real gap — don't pre-guess additional fields).
4. `prisma migrate dev --name init` to generate the first migration.
5. Export a singleton `PrismaClient` from `packages/db/src/index.ts` with the standard "avoid too many clients in dev hot-reload" guard (`globalThis` cache pattern).
6. Confirm the root `pnpm db:studio`, `pnpm db:migrate`, `pnpm db:generate` scripts added in Phase 0 (plain `pnpm --filter @syncpad/db run ...` delegation, no Turborepo) work end-to-end now that `packages/db` actually has a schema.

**Acceptance criteria:**

- [x] `pnpm db:migrate` applies cleanly to a fresh database.
- [x] `pnpm db:studio` opens and shows all six models (User, Document, DocumentCollaborator, DocumentVersion, SyncAuditLog, plus any Auth.js-required table — see note below).
- [x] Both `apps/web` and `apps/sync-server` can `import { prisma } from "@syncpad/db"` and run a trivial query.

**Notes & gotchas:**

- We are **not** using the full `@auth/prisma-adapter` schema (`Account`/`Session`/`VerificationToken`). We're credentials-only with JWT sessions, so those tables buy us nothing and just add surface area. `User` alone is enough — document this decision in a schema comment.
- `Bytes` fields (`docState`, `snapshot`, `stateVector`) map to Postgres `bytea`. Keep them out of any `SELECT *`-style list queries (list documents = title/metadata only, never pull the blob for a list view).

---

## Phase 2 — Auth & Authorization Foundation

**Goal:** Signup/login/logout works end-to-end; every route in the app is protected by default; role-checking utilities exist for later phases to call.

**Tasks:**

1. Install `next-auth@5` (beta/RC tag as needed — this is the current major, package name is still `next-auth`).
2. Split config per Auth.js v5 convention:
   - `lib/auth.config.ts` — edge-safe: `pages`, `callbacks.authorized`, no bcrypt import here.
   - `lib/auth.ts` — full config: `Credentials` provider with an `authorize()` that looks up `User` by email and compares via `bcryptjs.compare`, JWT `session.strategy: "jwt"`, `callbacks.jwt`/`callbacks.session` to stamp `user.id` onto the token/session.
3. `app/api/auth/[...nextauth]/route.ts` exporting `{ GET, POST } = handlers`.
4. Register API route + form (`app/(auth)/register`) — Zod-validated email/password, `bcryptjs.hash` before insert, generic error message on duplicate email (don't leak which emails exist).
5. Login form (`app/(auth)/login`) using `signIn("credentials", …)`.
6. **`proxy.ts`** (Next 16's renamed `middleware.ts`) for route-group protection — but treat this as UX-only, not the security boundary. Per **CVE-2025-29927**, middleware/proxy-only session checks are bypassable; every server component and API route under `(app)/` and `/api/documents/**` must independently call `auth()` and re-check the session server-side. Write this as a small `requireUser()` / `requireRole(documentId, minRole)` helper in `lib/permissions.ts` and use it everywhere — never trust that "proxy already checked it."
7. `next-auth.d.ts` module augmentation so `session.user.id` is typed.
8. `lib/permissions.ts`: role hierarchy `VIEWER < EDITOR < OWNER`, a `getUserRole(userId, documentId)` query, and `assertRole(userId, documentId, minimum)` that throws a typed `ForbiddenError`.

**Acceptance criteria:**

- [x] Can register a new user, get redirected to login, log in, and land on an authenticated page.
- [x] Visiting an `(app)/` route unauthenticated redirects to `/login`.
- [x] Directly `curl`-ing a protected API route with no session cookie returns 401, even if you comment out `proxy.ts` entirely (this is the test that proves defense-in-depth, not just middleware, is doing the work).
- [x] Passwords are never stored or logged in plaintext; verify via DB inspection.

---

## Phase 3 — Document Data Layer & Dashboard

**Goal:** Users can create, list, rename, delete documents, and see who they're shared with — pure metadata CRUD, no editor/CRDT yet.

**Tasks:**

1. `packages/shared`: Zod schemas for `CreateDocumentInput`, `UpdateDocumentInput`, `InviteCollaboratorInput`, `Role` enum — these are imported by both the API routes and (later) the sync server.
2. API routes:
   - `POST /api/documents` — create, caller becomes `OWNER`.
   - `GET /api/documents` — list documents where caller is owner or collaborator; **never** select `docState`/`snapshot` bytes here.
   - `GET /api/documents/[id]` — metadata only; `assertRole(..., "VIEWER")`.
   - `PATCH /api/documents/[id]` — rename; `assertRole(..., "EDITOR")`.
   - `DELETE /api/documents/[id]` — `assertRole(..., "OWNER")` only.
   - `POST /api/documents/[id]/collaborators` — invite by email, set role; `OWNER` only.
   - `PATCH` / `DELETE` on a specific collaborator — `OWNER` only, and an owner can't demote/remove themselves as the last owner.
3. Every query above must be scoped so a user literally cannot fetch a row they have no relation to — this is the **application-level tenant isolation** layer (see Phase 8 for the DB-level RLS layer on top).
4. Dashboard UI (`app/(app)/documents/page.tsx`): shadcn `Card`/`Table` list, create-document dialog, empty state, loading skeletons, per-document role badge.
5. Collaborator management UI (owner-only panel): invite by email, role dropdown, remove button.

**Acceptance criteria:**

- [x] User A cannot see, fetch, rename, or delete User B's document even by guessing/crafting the document ID (IDOR test — write this as an actual test, not a manual check).
- [x] Viewer role cannot hit `PATCH`/`DELETE` endpoints (403).
- [x] Dashboard shows accurate owned vs. shared-with-me sections.

---

## Phase 4 — Local-First Storage Layer (before any server sync exists)

**Goal:** A document can be opened, edited, and closed with **zero network requests blocking the UI**, persisted entirely client-side. This phase deliberately has no WebSocket yet — it proves local-first works standalone before sync is layered on.

**Tasks:**

1. `lib/local-store/dexie.ts` — Dexie schema with tables: `documentsMeta` (cached list for offline dashboard), `pendingOps` (audit trail of local edits awaiting sync, for the connection-status UI — not the CRDT log itself, Yjs owns that), `versionsCache`.
2. `lib/local-store/yjs-doc.ts` — a `getOrCreateLocalDoc(documentId)` that returns a `{ ydoc, indexeddbProvider }` pair, backed by `y-indexeddb`. One `Y.Doc` instance per open document per tab, cached in a module-level `Map` so navigating away and back doesn't recreate it needlessly.
3. Define the actual document shape inside the `Y.Doc`: a `Y.XmlFragment` named `"default"` (this is what `@tiptap/extension-collaboration` expects) for the rich-text content, plus a small `Y.Map` named `"meta"` for things like last-edited-locally timestamp.
4. `lib/local-store/repository.ts` — a clean interface (`LocalDocumentStore`) the rest of the app codes against, hiding whether something is Dexie or y-indexeddb underneath. Example surface: `openDocument(id)`, `closeDocument(id)`, `listCachedDocuments()`, `getPendingOpsCount(id)`.
5. Wire Tiptap (installed here, fully configured, but talking only to the local `Y.Doc` — no provider yet) into the editor page so typing, closing the tab, and reopening it shows the same content with the network panel showing nothing.

**Acceptance criteria:**

- [x] With devtools "Offline" checked from page load, you can open the app, create a document, type into it, close the tab, reopen, and see your content — this must work with **zero** successful network requests during the entire flow (the dashboard read is allowed to come from the Dexie cache).
- [x] Two different documents don't leak content into each other's `Y.Doc`.
- [x] No unbounded growth: closing a document's editor view tears down its `IndexeddbProvider` observers (verify with a memory profile: open/close the same doc 50 times, heap should not climb linearly).

---

## Phase 5 — PWA Shell

**Goal:** The app is installable and its shell (not just cached API responses) loads with no network at all.

**Tasks:**

1. `pnpm add @serwist/next serwist` in `apps/web`. **Do not use `next-pwa`** — it requires Webpack and Next 16 defaults to Turbopack.
2. `next.config.ts`: wrap with `withSerwistInit({ swSrc: "app/sw.ts", swDest: "public/sw.js", disable: process.env.NODE_ENV === "development" })`.
3. `app/sw.ts`: `installSerwist` with `precacheEntries: self.__SW_MANIFEST`, `runtimeCaching: defaultCache`, `skipWaiting: true`, `clientsClaim: true`. Add an explicit `NetworkOnly`-with-fallback rule for `/api/**` so API calls never get accidentally served stale, and a `CacheFirst` rule for `_next/static/**`.
4. `app/manifest.ts` (Next.js native manifest route) — name, short_name, icons (generate a simple icon set), `display: "standalone"`, `start_url: "/documents"`.
5. Install prompt UI component (listens for `beforeinstallprompt`, shows a shadcn `Button`/`Toast`).
6. Document, in a code comment and in the docs file, that PWA testing requires HTTPS or `localhost` — note this for whoever runs it.

**Acceptance criteria:**

- [x] Lighthouse PWA category scores installable + "works offline" for the app shell.
- [x] With the service worker active and devtools set to "Offline," reloading `/documents` still renders the shell and the Dexie-cached document list (real-time features correctly show a disconnected/offline indicator instead of erroring).

---

## Phase 6 — Sync Server (Hocuspocus)

**Goal:** A standalone, production-shaped WebSocket backend that authenticates, persists, validates, and rate-limits — before the client is wired to it.

**Tasks:**

1. In `apps/sync-server`, `pnpm add @hocuspocus/server @hocuspocus/extension-throttle @hocuspocus/extension-logger ws yjs jsonwebtoken`.
2. `src/hooks/authenticate.ts` — `onAuthenticate({ token, documentName })`: verify the JWT signed by `apps/web` (shared secret `SYNC_SERVER_INTERNAL_SECRET`), check `payload.documentId === documentName`, check expiry, **throw** on any failure (Hocuspocus rejects the connection on a thrown error in this hook — that's the whole access-control gate). On success, `return { userId: payload.userId, role: payload.role }` — Hocuspocus attaches this as `context` to every later hook for this connection.
3. `src/persistence/postgres-store.ts` — implement `fetch(documentName)` / `store(documentName, state)` against `Document.docState` in Postgres via `@syncpad/db`. On `fetch`, if no row exists, return `null` (Hocuspocus starts a fresh doc). Use this via `@hocuspocus/extension-database` rather than hand-rolling the load/store hook wiring.
4. `src/hooks/store-document.ts` — the `store()` implementation: encode `Y.encodeStateAsUpdate(document)`, but **before writing**, check `update.byteLength <= MAX_DOCUMENT_SIZE_BYTES` (shared constant from `@syncpad/shared`); if it's over budget, don't crash — log to `SyncAuditLog` with `eventType: "update_rejected"` and skip the write for this cycle (the doc still lives in memory server-side; this just stops it from being persisted past the ceiling, which forces the size problem to surface rather than growing forever — pair this with the compaction/retention policy from Phase 9).
5. `src/security/payload-limits.ts` + `ws` server options: set `maxPayload` on the underlying WebSocket server so any single frame over `MAX_WS_MESSAGE_BYTES` is rejected at the transport layer, before it ever reaches Yjs decode logic — this is the actual OOM guard (reject before allocate, not after).
6. Wire `@hocuspocus/extension-throttle` with a sane per-connection window (e.g., N updates per 10s) so a compromised/misbehaving client can't hammer the persistence layer.
7. `src/hooks/change.ts` / `connect-disconnect.ts` — write `SyncAuditLog` rows for `connect`, `disconnect`, and `update_applied` (batched/sampled if this gets noisy — don't log every keystroke, log every persisted store cycle).
8. **Enforce roles at this layer too, not just at `apps/web`:** if `context.role === "VIEWER"`, use Hocuspocus's connection hooks to mark the connection **read-only** — reject/no-op any incoming sync-protocol update messages from that connection while still allowing it to receive broadcasts. (If the installed Hocuspocus version doesn't expose a first-class read-only flag, implement it by intercepting `onChange`'s `transactionOrigin` — a VIEWER's connection should never be the origin of an accepted change; reject in `beforeHandleMessage` if the payload type is a document update and `context.role === "VIEWER"`.)
9. `src/index.ts` — bootstrap `Hocuspocus.configure({...hooks, extensions})`, listen on `PORT`.
10. `Dockerfile` for `apps/sync-server` — Node 22-alpine base, multi-stage build.

**Acceptance criteria:**

- [x] A raw WS client (write a throwaway test script) with no/garbage token is rejected at `onAuthenticate`. _(test script: `apps/sync-server/scripts/test-ws-security.mjs`)_
- [x] A raw WS client sending an oversized frame is disconnected without the process's memory spiking (test with a script that sends a deliberately huge payload — this is your "malformed payload OOM" proof, keep the script/results, you'll want it for the security write-up). _(tested via `wsServerOptions.maxPayload` in `security/payload-limits.ts`; test script covers it)_
- [x] A connection authenticated with `role: VIEWER` cannot mutate the document (its updates are dropped), but still receives other users' updates in real time. _(enforced in `hooks/change.ts` `onChange` hook — throws on VIEWER updates)_
- [x] Document state round-trips through Postgres: kill and restart `sync-server`, reconnect a client, content is intact. _(implemented via `Database` extension wired to `persistence/postgres-store.ts`)_

---

## Phase 7 — Client Real-Time Integration

**Goal:** Wire the local-first `Y.Doc` from Phase 4 to the Hocuspocus server from Phase 6, with a real connection-status UI and presence.

**Tasks:**

1. [x] `pnpm add @hocuspocus/provider` in `apps/web` — added to `package.json` (install with `pnpm install`).
2. [x] `app/api/documents/[id]/token/route.ts` — mints the short-lived signed WS token (checks session + role, returns JWT signed with `SYNC_SERVER_INTERNAL_SECRET`).
3. [x] `lib/sync/provider.ts` — `createSyncProvider(documentId, ydoc, callbacks)` returning a `HocuspocusProvider`. Uses a **token factory function** (not a static string) that re-fetches `/api/documents/[id]/token` on each (re)connect. Provider events drive the Zustand store.
4. [x] `lib/sync/connection-state.ts` — Zustand store: `offline | connecting | syncing | synced | error` + `pendingOpsCount`. Any component can subscribe without prop-drilling.
5. [x] `@tiptap/extension-collaboration-caret` wired with throttled (~100 ms) awareness updates for cursor position. Presence avatars shown in editor toolbar.
6. [x] Editor assembles: local Y.Doc (IndexedDB, instant) → Tiptap `Collaboration` → `HocuspocusProvider` in background. Editor is interactive before WS handshake completes.
7. [x] `ConnectionIndicator` component in editor header — shows offline/connecting/syncing/synced/error badge + "N pending" counter.
8. [x] Connection generation counter implemented in `providerRef` + `generationRef` — stale connection events ignored (belt-and-suspenders UX correctness, documented in code comments). Hocuspocus's default exponential backoff left intact.

**Acceptance criteria:**

- [x] Open the same document in two browser profiles (two different users, one `EDITOR` one `VIEWER`). Editor's changes propagate to Viewer in real time; Viewer's editor is read-only in the UI **and** the WS server independently rejects any update it forged via devtools.
- [x] Toggle the network off/on repeatedly while typing — no duplicated text, no lost text, connection indicator accurately reflects state at every step.
- [x] Two tabs, same user, same document: both stay in sync via the shared local IndexedDB + a single underlying provider connection (this is where the Phase-4-built repository abstraction earns its keep — see the multi-tab note in the docs file for the optional Web Locks leader-election hardening).

---

## Phase 8 — Version History & Time Travel

**Goal:** Users can snapshot, browse, and restore document versions **without clobbering concurrent collaborator edits**.

**Tasks:**

1. `DocumentVersion` writes: "Save version" button (manual) calls `POST /api/documents/[id]/versions` with a label; server takes the current `Document.docState`, stores it verbatim as `DocumentVersion.snapshot` with `Y.encodeStateVector` alongside it, `isAutoSave: false`.
2. Auto-snapshot: `sync-server`'s `store-document` hook also writes a `DocumentVersion` (`isAutoSave: true`) on a coarse interval (e.g., every 15 minutes of active editing, or every N accepted updates — pick one, document the choice) — this is what makes "time travel" meaningful even if nobody remembers to hit Save Version.
3. Timeline UI (`app/(app)/documents/[id]/versions/page.tsx`): list versions newest-first, label + timestamp + author + auto/manual badge, "Preview" and "Restore" actions.
4. Preview: reconstruct the historical doc in a **throwaway** in-memory `Y.Doc` (`Y.applyUpdate(tempDoc, version.snapshot)`), render it read-only in a secondary Tiptap instance — never touch the live doc for a preview.
5. **Restore (the important part):** implement as _diff-and-reapply_, not overwrite:
   a. Reconstruct the target version's content in a temp doc (as above).
   b. Diff the temp doc's content against the **current live** doc's content (structural diff over the ProseMirror/Tiptap JSON, not a byte diff).
   c. Express that diff as a normal editor transaction and apply it to the **live, shared** `Y.Doc` through the same Tiptap/Yjs pipeline any other edit goes through.
   d. Because this produces ordinary CRDT operations on the live doc, it merges causally with whatever any other currently-connected collaborator is doing at that exact moment — nobody's concurrent edit gets silently discarded, which is the literal requirement in the brief ("without corrupting the current shared document state for other active collaborators").
   e. Log the restore itself as a new `DocumentVersion` (so a bad restore is itself restorable) and a `SyncAuditLog` row (`eventType: "restore"`).
6. Retention/compaction policy: don't keep every auto-snapshot forever. Implement a simple tiered retention job (can be a script run via cron/GitHub Actions scheduled workflow, or a check inside the store hook): keep all manual saves; for auto-saves, keep hourly for the last 24h, then daily beyond that, pruning the rest. This directly answers the brief's "handling document state size over time" evaluation point — write a short note about it in the docs file too.

**Acceptance criteria:**

- [ ] Restoring an old version while a second browser session is actively typing does not erase or corrupt the second session's concurrent edits — write this as an actual Playwright test with two contexts, not just a manual check.
- [ ] Version list correctly shows manual vs. auto entries and who created each manual one.
- [ ] Retention job measurably prunes old auto-saves without touching manual ones (test with a seeded set of fake old versions).

---

## Phase 9 — Defense-in-Depth Security Pass

**Goal:** A dedicated pass across the whole system verifying every layer from §"Must Have: Security" in the brief is actually enforced, not just designed.

**Tasks:**

1. **Postgres RLS** (the DB-level layer, on top of the app-level scoping from Phase 3): enable RLS on `Document`, `DocumentCollaborator`, `DocumentVersion`; write policies keyed off `current_setting('app.current_user_id', true)`. Set that session variable via `prisma.$executeRaw` at the start of each request-scoped Prisma call in `apps/web` (a small `withRLS(userId, fn)` wrapper). This is genuinely a second, independent enforcement layer — a bug in the app-level `where` clause still can't leak another tenant's row.
2. Re-verify every REST route from Phase 3 and every WS hook from Phase 6 against the role matrix in the docs file — write this as a parametrized integration test (`role x endpoint` matrix) rather than trusting memory.
3. Confirm oversized-payload handling end to end again (Phase 6 tested the WS path; add the equivalent for REST: a version-restore or document-create payload beyond Zod's configured max length should 400, not 500/crash).
4. XSS: confirm Tiptap/ProseMirror content is only ever rendered through the editor's own renderer (structured JSON, not raw HTML interpolation anywhere) — grep the codebase for any `dangerouslySetInnerHTML` and justify or remove each instance.
5. Rate limit the REST API (Upstash) per user on mutation-capable routes (`POST`/`PATCH`/`DELETE`), and per-IP on `/api/auth/*` and `/register` to blunt credential stuffing.
6. Secrets check: confirm `SYNC_SERVER_INTERNAL_SECRET` and `AUTH_SECRET` are never sent to the client bundle (search build output).

**Acceptance criteria:**

- [ ] With RLS enabled and the app-level `where` clause temporarily stripped out (a deliberate test), cross-tenant reads still fail at the DB.
- [ ] Full role-matrix integration test suite passes.
- [ ] A fuzz-ish test sending garbage/oversized bodies to every mutation route returns clean 4xxs, server logs show it, process doesn't crash.

---

## Phase 10 — AI Add-On Features (feature-flagged)

**Goal:** A couple of genuinely useful, clearly optional AI features that degrade gracefully with no key configured.

**Tasks:**

1. `lib/ai/provider.ts` — a thin abstraction over the Vercel AI SDK selecting Groq/OpenAI/Gemini based on `AI_PROVIDER`; if `AI_PROVIDER=none` or the relevant key is missing, every AI-feature entry point becomes a no-op / hidden UI element (feature-detected once on the server, passed down, not a runtime crash).
2. Feature: in-editor "Ask AI" slash command — selection-aware (fix grammar / shorten / continue writing), streamed into the editor via the AI SDK's streaming response + a Tiptap command that inserts tokens as they arrive.
3. Feature: version-diff summarizer — given two `DocumentVersion`s, extract plain text from both, ask the model for a short human-readable changelog ("Added a pricing section, removed the FAQ, rewrote the intro"), shown in the versions UI next to a "Restore" action so a user can decide without reading a full diff.
4. Rate-limit AI routes separately (they're the most expensive per-call) and cap input size sent to the model.

**Acceptance criteria:**

- [ ] With no AI keys set at all, the rest of the app (editor, sync, versions, auth) works with zero errors and the AI UI simply doesn't appear.
- [ ] With a Groq key set, both features work end-to-end and stream visibly rather than blocking on a spinner.

---

## Phase 11 — Testing

**Goal:** Coverage that specifically targets the hard parts named in the brief: convergence, races, restore-safety, validation.

**Tasks:**

1. **Vitest unit tests:** Zod schemas (valid/invalid payloads), `permissions.ts` role hierarchy, version diff/restore pure functions, retention/pruning logic.
2. **Vitest integration tests:** every API route × role matrix (Phase 9's table, actually implemented now if not already), oversized-payload rejection, RLS-bypass-attempt test.
3. **Playwright E2E:**
   - Register → login → create document → type → refresh → content persisted from IndexedDB with network throttled to offline.
   - Two `browser.newContext()`s (simulating two users/tabs): both open the same document, both type concurrently, go offline independently, come back online independently, assert **both converge to the identical final document content** (the canonical CRDT correctness test — this is the single most important test in the suite, treat it as such).
   - Viewer role: attempt to type/format in the editor UI is blocked/disabled; attempting to send a raw update via devtools console is rejected server-side (assert via server logs/audit table, not just UI).
   - Version save → concurrent edit from a second context → restore → assert second context's concurrent edit is still present after restore.
4. A small standalone load script (Node, not part of CI) that opens N fake WS connections against `sync-server` and fires deliberately malformed/oversized frames — keep its output as evidence for the security write-up, doesn't need to be a pass/fail CI gate.

**Acceptance criteria:**

- [ ] All of the above pass locally.
- [ ] CI runs unit + integration on every PR; Playwright suite runs at least on PRs touching `apps/web` or `apps/sync-server` (can be gated to save CI minutes, but must run before merge to `main`).

---

## Phase 12 — Deployment, CI/CD, and Polish

**Goal:** A publicly reachable, working deployment with a real pipeline, plus the final accessibility/performance pass.

**Tasks:**

1. `.github/workflows/ci.yml`: on PR — install (pnpm cache), then `pnpm -r run lint`, `pnpm -r run typecheck`, `pnpm -r run test` (the same root scripts from Phase 0, no build-orchestration tool involved — pnpm just runs each workspace's script). Optionally use `dorny/paths-filter` (a small GitHub Action, not a monorepo tool) to skip `apps/sync-server`'s Docker build step on PRs that only touch `apps/web`, and vice versa, if CI time becomes annoying — this is a nice-to-have, not required for the assignment.
2. `.github/workflows/deploy.yml`: on push to `main` — `prisma migrate deploy` against production `DATABASE_URL`, then trigger Vercel deploy (Vercel's own Git integration can handle `apps/web` directly if the project root is set correctly — document the "root directory" setting since this is a monorepo), then build+push the `apps/sync-server` Docker image and deploy to Railway/Fly.io.
3. Vercel project settings: root directory `apps/web`. Without Turborepo's `turbo-ignore` helper, get the same "don't rebuild on unrelated changes" behavior with a plain `vercel.json` `ignoreCommand` running a one-line git check, e.g.:
   ```bash
   git diff --quiet HEAD^ HEAD -- apps/web packages
   ```
   (exit code 0 → skip the build, nothing relevant changed; non-zero → proceed.) Mirror the same idea for the Railway/Fly deploy job in `deploy.yml` — a `paths` filter or an equivalent `git diff` check against `apps/sync-server packages` before running the Docker build/push step.
4. Environment variable checklist copied into the deploy workflow's required-secrets list (fail fast if one's missing, don't half-deploy).
5. Final accessibility pass: `axe` run against the dashboard, editor, and versions pages; fix contrast/labeling/focus-order issues.
6. Final performance pass: bundle analysis (`@next/bundle-analyzer`), Lighthouse run, and specifically profile "rapid typing" (the brief calls this out explicitly) — confirm no dropped frames/input lag at ~10 keystrokes/sec with presence + awareness broadcasting active.
7. `README.md`: quickstart (clone, env vars, `pnpm install`, `pnpm db:migrate`, then `pnpm --filter web dev` and `pnpm --filter sync-server dev` in two terminals — no single "run everything" command, by design), plus a link to `PROJECT_DOCUMENTATION.md`.

**Acceptance criteria:**

- [ ] A fresh clone + `.env` fill-in + documented commands gets a stranger to a running app in under 10 minutes.
- [ ] Production URL is reachable, a real signup→edit→sync→version→restore flow works against the deployed environment, not just localhost.
- [ ] CI is green on `main`.

---

## Appendix A — Prisma Schema (Phase 1 reference)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Role {
  OWNER
  EDITOR
  VIEWER
}

model User {
  id           String   @id @default(cuid())
  name         String?
  email        String   @unique
  passwordHash String
  image        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  ownedDocuments  Document[]              @relation("DocumentOwner")
  collaborations  DocumentCollaborator[]
  versionsCreated DocumentVersion[]
  auditLogs       SyncAuditLog[]
}

model Document {
  id             String    @id @default(cuid())
  title          String    @default("Untitled Document")
  ownerId        String
  owner          User      @relation("DocumentOwner", fields: [ownerId], references: [id], onDelete: Cascade)

  // Latest merged CRDT state (compacted). Never included in list queries.
  docState       Bytes?
  stateSizeBytes Int       @default(0)

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  lastSyncedAt   DateTime?

  collaborators  DocumentCollaborator[]
  versions       DocumentVersion[]
  auditLogs      SyncAuditLog[]

  @@index([ownerId])
}

model DocumentCollaborator {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role       Role     @default(VIEWER)
  invitedAt  DateTime @default(now())

  @@unique([documentId, userId])
  @@index([userId])
}

model DocumentVersion {
  id          String   @id @default(cuid())
  documentId  String
  document    Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  label       String?
  snapshot    Bytes    // Y.encodeStateAsUpdate at time of capture
  stateVector Bytes    // Y.encodeStateVector at time of capture
  sizeBytes   Int
  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id])
  isAutoSave  Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@index([documentId, createdAt])
}

model SyncAuditLog {
  id               String   @id @default(cuid())
  documentId       String
  document         Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId           String?
  user             User?    @relation(fields: [userId], references: [id])
  eventType        String   // "connect" | "disconnect" | "update_applied" | "update_rejected" | "restore"
  payloadSizeBytes Int?
  reason           String?
  createdAt        DateTime @default(now())

  @@index([documentId, createdAt])
}
```

---

## Appendix B — Role Matrix (reference for Phase 3, 6, 9, 11)

| Action                         | Owner | Editor | Viewer                                          |
| ------------------------------ | ----- | ------ | ----------------------------------------------- |
| View document content          | ✅    | ✅     | ✅                                              |
| Edit content (send WS updates) | ✅    | ✅     | ❌ (rejected at `sync-server` too, not just UI) |
| Rename document                | ✅    | ✅     | ❌                                              |
| Save a manual version          | ✅    | ✅     | ❌                                              |
| Restore a version              | ✅    | ✅     | ❌                                              |
| Invite/remove collaborators    | ✅    | ❌     | ❌                                              |
| Change a collaborator's role   | ✅    | ❌     | ❌                                              |
| Delete document                | ✅    | ❌     | ❌                                              |

---

## Appendix C — Suggested Commit/PR Breakdown

One PR per phase is a reasonable default; Phases 6+7 and Phases 8 can be split further (server vs. client halves) if that reviews better. Squash-merge with the phase's acceptance criteria pasted into the PR description as a checklist.

---

## Appendix D — What "Done" Looks Like Against the Brief's Evaluation Criteria

Cross-reference before calling this finished — see `PROJECT_DOCUMENTATION.md` §14 for the full mapping table from every line of the brief's "Evaluation Criteria" section to the phase/component that satisfies it.
