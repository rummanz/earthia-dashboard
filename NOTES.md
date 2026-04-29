# Earthia Dashboard — Build Notes

## OpenClaw Mission Control backend integration (this commit)

The dashboard now talks to a live **OpenClaw Gateway** (WebSocket) and persists
its own state in **SQLite** (`data/mission-control.db`). Every endpoint from
the backend integration spec (sections 5.1–5.9, 6) is implemented under
`app/api/`. Real-time updates flow over SSE at `/api/events/stream` from an
in-process broadcaster.

### New files

```
lib/openclaw/client.ts            # Server-only WS client (auto-reconnect, request/response, events)
lib/db/schema.ts                  # SQL DDL (tasks, agents, openclaw_sessions, events, ...)
lib/db/index.ts                   # better-sqlite3 singleton (data/mission-control.db)
lib/db/types.ts                   # Row + insert/patch types
lib/db/repo.ts                    # CRUD helpers
lib/sse/broadcast.ts              # In-process pub/sub used by API routes
scripts/test-gateway.ts           # Smoke test: connects, lists sessions/agents/models
middleware.ts                     # Auth middleware (Bearer / same-origin / SSE token / DEMO_MODE)
next.config.mjs                   # Marks ws/better-sqlite3 as external (avoids webpack bundling native deps)

app/api/openclaw/status/route.ts
app/api/openclaw/models/route.ts
app/api/openclaw/sessions/route.ts
app/api/openclaw/sessions/[id]/route.ts
app/api/openclaw/sessions/[id]/history/route.ts
app/api/agents/discover/route.ts
app/api/agents/import/route.ts
app/api/tasks/route.ts
app/api/tasks/[id]/route.ts
app/api/tasks/[id]/dispatch/route.ts
app/api/tasks/[id]/activities/route.ts
app/api/tasks/[id]/deliverables/route.ts
app/api/tasks/[id]/subagent/route.ts
app/api/events/route.ts
app/api/events/stream/route.ts
app/api/webhooks/agent-completion/route.ts

components/shared/connection-status.tsx   # Sidebar connection indicator (polls /api/openclaw/status)
components/shared/sse-provider.tsx        # Subscribes to SSE, invalidates React Query keys
```

### Files changed

```
.env.local                            # Added OPENCLAW_GATEWAY_URL/_TOKEN, removed mock-mode default
.gitignore                            # Added /data/
package.json                          # +ws, +better-sqlite3, +@types/ws, +@types/better-sqlite3, +tsx
components/shared/sidebar.tsx         # Removed "Add Content" CTA from nav (still keyboard "N")
components/shared/providers.tsx       # Wrapped children in <SSEProvider>
components/content/add-content-modal.tsx  # confirm() now POSTs to /api/tasks + logs an activity
components/dashboard/feed-table.tsx   # Loads /api/tasks via React Query and merges into the local store
lib/api.ts                            # Default to same-origin, added listTasks/createTask/etc, no more
                                      # `mock unless API_URL set` heuristic — now opt-in via NEXT_PUBLIC_MOCK_MODE=true
```

### Env

```
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=cb66a75d6f37e6bed0e39b0d2c7cfa3821ff327282c7cfae
NEXT_PUBLIC_MOCK_MODE=false
NEXT_PUBLIC_APP_NAME=Earthia
AGENTS_DIR=./agents
```

Optional:

- `MC_API_TOKEN` – if set, `/api/*` requires Bearer auth (browser same-origin
  is still allowed; SSE accepts `?token=` query param).
- `WEBHOOK_SECRET` – HMAC verification on `/api/webhooks/agent-completion`.
- `DEMO_MODE=true` – blocks non-GET on `/api/*` (returns 403).
- `ALLOW_DYNAMIC_AGENTS=false` – prevents `tasks/:id/subagent` from auto-creating
  agent rows.
- `MC_DB_PATH` – override SQLite location (default `data/mission-control.db`).

### Sanity check the gateway

```
npx tsx scripts/test-gateway.ts
```

Connects with the protocol-v3 handshake, lists sessions/agents/models, and
disconnects. Useful to verify gateway reachability without spinning up Next.

### Wired vs not (this layer)

**Wired** (live against the gateway / SQLite):

- All endpoints from spec sections 5.1–5.9 and section 6 (webhook).
- Sidebar connection indicator polls every 10s via React Query.
- Add Content modal POSTs to `/api/tasks` (the local content store still holds
  mock-shaped rows for the existing UI, but real tasks live in SQLite and now
  show up in the Dashboard table on top of any seeded mock items).
- SSE provider invalidates the `tasks` / `activities` / `deliverables` query
  keys on push events.
- `chat.send` dispatch flow against the gateway (`tasks/:id/dispatch`).

**Stubbed / minimal**:

- `task_roles`, `planning_questions`, `planning_specs` exist as tables but no
  API surface yet (planning endpoints from spec section 7 are not in this
  commit — out of scope for this pass).
- 409 conflict handling for "master agent vs orchestrator" is not implemented;
  dispatch is single-flow.
- `lib/api.ts` still keeps a mock fallback path for offline dev when
  `NEXT_PUBLIC_MOCK_MODE=true`. With `false` (default) it goes against the
  same-origin Next.js API routes for tasks; the legacy `/api/content` and
  `/api/agents/status` shapes still resolve through their hardcoded mock
  fallbacks because no Next route was added for them in this pass.
- Tasks-as-content rendering uses sensible defaults (image / 1080×1080) when a
  task didn't come from the Add Content modal. The Add Content modal stores
  the rich metadata as JSON in `task.description`.

### Why a custom `next.config.mjs`

`ws` ships native acceleration (`bufferutil`, `utf-8-validate`). Next.js 14
webpack-server bundling rewrites those imports such that
`bufferUtil.mask` becomes undefined at runtime ("`bufferUtil.mask is not a
function`"). Marking `ws`, `bufferutil`, `utf-8-validate`, and
`better-sqlite3` as `commonjs` externals on the server bundle keeps them
loaded from `node_modules` at runtime where Node can resolve the optional
native bindings.

### Verification (this commit)

- `npm run build` → clean (see commit message).
- `npx tsx scripts/test-gateway.ts` → connect.challenge → connect (v3) →
  `sessions.list`, `agents.list`, `models.list` all OK.
- Live `curl` against `npm run dev`:
  - `GET /api/openclaw/status` → `{"connected":true,"sessions_count":3,...}`
  - `GET /api/tasks` → `[]` (empty on first run) then includes the POSTed task
  - `POST /api/tasks` → `201 Created` with the persisted row
  - SSE keep-alive emits `:` ping every 30s.

---

## Project naming

The spec text repeatedly says "OpenClaw" but the directory was specified as
`earthia-dashboard`. Folder name is `earthia-dashboard`; the in-product brand
stays "OPENCLAW" everywhere the spec calls for it (sidebar logo, metadata
title, agent .md content).

## Mock mode (frontend)

Set `NEXT_PUBLIC_MOCK_MODE=true` to short-circuit `lib/api.ts` to the seeded
mock data in `lib/mock-data.ts`. With `false` (default after this commit),
`api.listTasks()`, `api.createTask()`, etc. hit the real Next.js API routes
which proxy to the gateway / SQLite.

## Shadcn replacement

Hand-rolled minimal shadcn-style primitives under `components/ui/` wrapping
Radix UI directly — unchanged in this pass.

## Type safety

All new code is strict TypeScript with no `any`. Tolerant runtime parsing on
gateway responses (the spec calls this out — payload shapes vary).
