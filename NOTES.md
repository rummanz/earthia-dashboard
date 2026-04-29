# Earthia Dashboard — Build Notes

## DB-backed content pipeline + scheduler + run-now (this commit)

This pass cuts every remaining mock seed out of the runtime UI and moves the
entire content-item lifecycle into SQLite, behind a 10s scheduler tick.

### Highlights

- **No more seed data in the UI.** `lib/mock-data.ts` is reduced to empty
  arrays + a default `AppSettings` constant. `useContentStore` and
  `useTemplateStore` start empty. `lib/api.ts` no longer returns mocked
  responses — every method hits the real `/api/*` routes. `MOCK_MODE` is now
  a forced-empty switch (renders empty states without the network), not a
  fake-data switch.
- **Tasks table extended** with content-pipeline columns via idempotent
  ALTER TABLE migrations in `lib/db/index.ts`: `content_type`, `dimensions`,
  `platforms`, `template_id`, `prompt_body`, `review_score`, `reviewer_notes`,
  `schedule_kind`, `schedule_at`, `schedule_meta`, `published_to`,
  `next_run_at`, `media_url`, `thumbnail_url`, `published_at`.
- **`prompt_templates` table** added with full CRUD: `GET/POST /api/prompts`
  and `GET/PATCH/DELETE /api/prompts/:id`. The Prompts page now reads/writes
  through React Query against these endpoints; the Zustand template store is
  no longer used as a source of truth.
- **`/api/agents/status`** is a real DB-backed endpoint now (no more
  hardcoded mock fallback). It returns a map keyed by agent id.
- **Dashboard feed-table sources rows directly from React Query**
  (`useQuery({ queryKey: ['tasks'] })`) and maps `TaskRow → ContentItem` via
  `lib/task-mapper.ts`. The Zustand `useContentStore` is no longer touched
  by the table. SSE invalidation already wired in `components/shared/sse-provider.tsx`
  is what drives live updates.
- **Scheduler** (`lib/scheduler/index.ts`) is a singleton on
  `globalThis.__ocScheduler`, started lazily the first time `getDb()` is
  called by any API route. It ticks every 10s, atomically claims up to 5 due
  tasks (`status='queued' AND next_run_at <= now()`), and runs a placeholder
  pipeline: `queued → generating → reviewing → approved/rejected → published`.
  Every transition broadcasts SSE. For recurring schedules (hourly/daily/
  weekly), the scheduler computes the next `next_run_at` and resets the task
  to `queued` after the terminal stage. The placeholder review_score is
  `1 + Math.floor(Math.random() * 9)` and is clearly marked as such in the
  code — the user's real generation/review backend will replace `runDispatch`.
- **Add Content modal step 4** now shows five options: **Now** (default,
  selected), Once, Hourly, Daily, Weekly. "Now" sets `schedule_kind="now"`
  and `schedule_at = new Date().toISOString()` so the next scheduler tick
  picks it up within ~10s. Confirm POSTs the full `CreateTaskPayload` to
  `/api/tasks` with content_type/dimensions/platforms/template_id/prompt_body/
  schedule_*. On success it invalidates the `tasks` query key. No Zustand
  mutation.
- **Topbar** now reads pending-review/queued counts from the
  `['tasks']` query and shows agent dots for whatever agents the DB knows
  about (no more hardcoded coordinator/prompt-engineer/etc.).

### Files added

```
app/api/prompts/route.ts            # GET, POST templates
app/api/prompts/[id]/route.ts       # GET, PATCH, DELETE one template
app/api/agents/status/route.ts      # DB-backed agent status map
lib/db/prompt-template-mapper.ts    # PromptTemplateRow → DTO (server-only)
lib/scheduler/index.ts              # Singleton 10s scheduler (placeholder pipeline)
lib/task-mapper.ts                  # TaskRow → ContentItem mapping for the UI
```

### Files changed

```
lib/db/schema.ts                    # +prompt_templates, +TASK_COLUMN_MIGRATIONS
lib/db/index.ts                     # idempotent ALTER TABLE migration; lazy scheduler boot
lib/db/repo.ts                      # extended createTask/updateTask for new fields,
                                    #   listDueTasks(), prompt_templates CRUD
lib/db/types.ts                     # extended TaskRow, TaskInsert; +PromptTemplateRow
app/api/tasks/route.ts              # accepts new fields, computes next_run_at by schedule_kind
lib/api.ts                          # purged mock branches, added prompts/agents/tasks methods
lib/mock-data.ts                    # empty arrays + DEFAULT_SETTINGS-shaped AppSettings only
lib/store.ts                        # no more mock seeding; default settings inlined
components/dashboard/feed-table.tsx # sources rows from /api/tasks via React Query
components/dashboard/content-preview-modal.tsx # takes ContentItem prop directly
components/content/add-content-modal.tsx # "Now" option (default), POSTs full payload
components/prompts/prompts-grid.tsx # React Query against /api/prompts
components/prompts/template-editor.tsx # React Query mutations for create/update
components/shared/topbar.tsx        # counts from /api/tasks; agent list from DB
```

### Verification

- `rm -f data/mission-control.db && npm run build` → exit 0.
- `npm run dev`, then:
  - `GET /api/tasks` → `[]`
  - `GET /api/prompts` → `[]`
  - `curl /dashboard | grep -c "No content"` → 1
  - `POST /api/tasks` with `schedule_kind: "now"` → 201, status `queued`,
    `next_run_at` set to now.
  - After ~13s the same task transitions out of `queued`
    (`generating` → `reviewing` → `approved/rejected` → `published`).
- `grep -rn "mock-data" components/ app/ lib/api.ts lib/store.ts` → only a
  comment in `lib/store.ts` documenting the absence.

### Known caveats / placeholders

- The dispatch pipeline triggered by the scheduler is a **simulator**: it
  fakes `generating`/`reviewing`/`published` with timeouts and a random
  review_score. The hook for the real backend is `runDispatch()` in
  `lib/scheduler/index.ts`. For tasks that have an `assigned_agent_id`,
  `POST /api/tasks/:id/dispatch` still goes through the real OpenClaw
  Gateway path — but the scheduler does **not** call that route yet because
  most user-created tasks won't have an assigned agent. Wiring scheduler →
  dispatch is a follow-up, not an MVP-blocker.
- `published_to` URLs from the placeholder publisher are
  `https://example.com/posts/<task>/<platform>` so the published-icons row
  in the table renders something during smoke testing.
- Status names: the DB now mixes "new pipeline" statuses (`generating`,
  `reviewing`, `approved`, `rejected`, `published`) with the legacy
  workflow statuses (`assigned`, `in_progress`, `done`, `failed`,
  `cancelled`). `lib/task-mapper.ts:statusToContent` normalizes both into
  the UI's `ContentStatus` enum.

---


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
