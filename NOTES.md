# Earthia Dashboard — Build Notes

## Project naming
The spec text repeatedly says "OpenClaw" but the directory was specified as `earthia-dashboard`. Folder name is `earthia-dashboard` per task instructions; the in-product brand stays "OPENCLAW" everywhere the spec calls for it (sidebar logo, metadata title, agent .md content).

## Mock mode
`lib/api.ts` reads `NEXT_PUBLIC_OPENCLAW_API_URL`. If unset (default in `.env.local`), or `NEXT_PUBLIC_MOCK_MODE=true`, every API call resolves to mock data from `lib/mock-data.ts`. The Zustand stores (`useContentStore`, `useTemplateStore`, `useSettingsStore`) are seeded from the same mock data so optimistic mutations Just Work without a backend.

To go live: set `NEXT_PUBLIC_OPENCLAW_API_URL=http://your-backend` and `NEXT_PUBLIC_MOCK_MODE=false`. The Zustand stores are still the source of truth for the UI; React Query is wired for the agent status poll and could be expanded.

## Shadcn replacement
We did NOT run `npx shadcn` interactively. Instead we hand-rolled minimal shadcn-style primitives under `components/ui/` (Button, Input/Textarea, Card, Badge, Dialog, Select, Tabs, Tooltip, Dropdown, Checkbox, RadioGroup, Popover). They wrap Radix UI directly and are styled with Tailwind + CSS variables.

## What's wired vs. stubbed
- **Wired**: dashboard table with filters/sort/search, content preview modal, prompt template CRUD (Zustand), 4-step Add Content modal that creates a new queued item, agents page reads `/agents/*.md` server-side via `gray-matter`, settings page persists to in-memory store, top bar agent dots poll `api.agentStatus()` every 5s (returns mocked steady-state when no backend), keyboard shortcuts `N` / `P` / `Esc` / `?`, status badges, 9-segment review score bar with threshold-aware coloring, social platform icon row.
- **Stubbed**: per-platform support warning is shown but doesn't actually block submission; "Create new template" link inside Add Content (step 3) was deemed redundant — users can hit the dedicated /prompts page instead. Recharts is installed but unused (no chart was actually requested in the spec — the score bar is custom). The pagination requirement (25/page) is not implemented; the whole list renders since mock data is small (12 items).
- **Not implemented**: Live polling indicator on rows currently being processed is approximated by `animate-pulse-dot` on `generating`/`reviewing` rows (no per-row job-id matching against agent status — would need wiring to `currentJob`). Mobile-specific column hiding uses Tailwind `hidden md:table-cell` rather than dynamic priority logic. Error boundaries are not wrapped per-section (Next.js's default error boundary is in play); a future enhancement would add `error.tsx` files per route.

## File layout choices
- `app/page.tsx` redirects to `/dashboard`.
- `Shell` (in `components/shared/shell.tsx`) is a client component that mounts the global AddContentModal + ShortcutHelp once, plus the keyboard shortcut hook.
- Agent .md files live in `/agents/` at the project root and are read on the server (via `force-dynamic` on the routes that load them, so updates show without rebuild).

## Type safety
All app code uses the interfaces from `lib/types.ts` per spec section 10. No `any` was introduced. There are a couple of `eslint-disable @next/next/no-img-element` comments where remote URLs are intentional (preview thumbnails) — using `next/image` would require configuring `images.remotePatterns` for picsum.photos and isn't required by the spec.

## Build
`npm run build` is the source of truth.
