# inspkt — Next steps & handoff

Pick-up notes for a fresh session. Full phase history is in `docs/roadmap.md`;
this file is the actionable "where we are / what's next / what to watch out for".

## Where we are (as of 2026-06-15)

- **Deployed:** https://inspkt.vagmi-mudumbai.workers.dev (Cloudflare Worker).
  Phase 9 + form↔type association + machine API keys are **live as of
  2026-06-15** (version `52087f4c`; migrations `0013`/`0014` applied remote;
  `API_KEY_PEPPER` set as a Worker secret).
- **Tests:** 232 passing; `pnpm typecheck` + `pnpm build` clean.
- **Shipped (deployed):** Phases 0–9 plus refinements 8a/8b/8c, form↔type
  association (both sides), and machine API keys (see roadmap + `docs/api-access.md`).
  The domain model is settled:

  ```
  Client ──< Facility ──< Equipment (of an Equipment Type)
                              ^ also: mobile equipment with no facility
  Equipment Type ──< custom fields (metadata schema) ; ⋈ Forms (many-to-many)
  Equipment ── metadata values (validated against its type's fields)
  Inspection ── targets EQUIPMENT + one of its type's forms (Phase 9);
                snapshots the equipment's facility (null for mobile)
  ```

- **Roles (app-owned):** admin / manager / inspector in `memberships.role`
  (authoritative — NOT the Clerk session). Gate via `app/lib/capabilities.ts`
  (`can.setup`, `can.inspect`, etc.). See memory `app-owned-authorization`.
- **Nav (after 8c):** Inspections · Clients · Types · Forms · Members. `/app`
  index = Clients (admin/manager); inspectors land on `/app/inspections`.
  Facility + equipment CRUD lives **inside the client detail page**
  (`app/routes/app/client-detail.tsx`, a multi-intent action).

## JUST BUILT: Phase 9 — Retarget inspections to Equipment (deploy pending)

An inspection now targets a piece of **equipment** + one of that equipment's
**type's forms**. Done locally (198 tests + typecheck + build green); see the
roadmap Phase 9 "Built" note for the full description. Decisions taken:
**kept `facilityId`** as a denormalized snapshot of the equipment's facility
(null for mobile), in addition to the new `equipmentId`.

**To finish shipping it (do this first):**
1. `wrangler d1 execute inspkt --remote --command "SELECT COUNT(*) FROM
   inspections"` → must be 0 (migration `0013` is a table rebuild; safe only on
   empty tables — observations must be empty too, which follows from 0 inspections).
2. `pnpm db:migrate:remote` (applies `0013`).
3. `pnpm build && npx wrangler deploy` (use `dangerouslyDisableSandbox` here).
4. Smoke-test: start an inspection by picking equipment + form, capture, submit.
5. Tick the Phase 9 box in `docs/roadmap.md`.

**Watch out:** `0013` was hand-edited — drizzle's generated `INSERT … SELECT`
referenced the *new* `equipment_id` column from the *old* table (which lacks it);
the copy now omits it so it defaults NULL. The `item_id`/`facilityId` column was
relaxed to nullable in the same rebuild (mobile equipment has no facility).

## NEXT: Phase 10 — Assignments & inspector queue

- **Phase 10 — Assignments & inspector queue:** managers assign
  (inspector+equipment+form+due date) → seeds a draft inspection; inspector
  "my assignments" queue.
- **Phase 11 — Verdict engine** (the core): `corrections` + verdict fields on
  inspections; pure `verdict-service`; wired into submit.
- **Phase 12 — Report**, **13 — Role-aware dashboard**, **14 — Billing (Polar)**,
  **15 — Production hardening**.
- **Shipped (deployed 2026-06-15):** **Machine API keys** — orgs mint `inspkt_…`
  Bearer keys (admin-only, `/app/api-keys`) for headless write access; a key
  authenticates as a manager-equivalent actor. Hashed with `API_KEY_PEPPER`
  (HMAC), shown once. Migration `0014`. See `docs/api-access.md`. Note:
  `API_KEY_PEPPER` is permanent in prod — rotating it invalidates all keys.
- **Deferred/known follow-ups:**
  - **Read-only metadata display** on equipment rows (values are editable in the
    form but not shown read-only on list/client views yet).
  - "Edit client" button on the client detail header (client edit lives on the
    Clients index list today).
  - Map view; AI-assisted inspection (PRD Phase 2).

## Conventions & gotchas (read before coding)

- **Vertical slices:** schema → repo (only DB layer, every query org-scoped) →
  service (business rules, NotFound/Validation/PlanLimit errors) → controller
  (Hono + zod at the edge, `requireCapability(can.x)` on writes) → route
  (loader/action via `apiFetch` in-process) → **tests at every layer**.
- **Authorize from `c.var.role`** (app role), never the Clerk session. UI builds
  actors from `/api/me`'s `role`.
- **Migrations (D1/SQLite) — the big trap:** D1 runs each migration in a
  transaction where `PRAGMA foreign_keys=OFF` is a **no-op**. Drizzle's
  column-drop / not-null-change does a **table rebuild** (`DROP TABLE … RENAME`)
  that FAILS if the table is referenced by a FK and has child rows. So:
  - **Prefer additive `ADD COLUMN`.** Make "required" columns **nullable in the
    DB + required in the app/validation** (pattern used for `facilities.client_id`,
    `equipment.client_id`). Avoid rebuilds.
  - If a rebuild is unavoidable, **verify the table is empty on remote first**
    and put any backfill BEFORE the rebuild. Hand-edit the generated SQL if
    needed (we've done this several times — see migrations 0006, 0008).
  - Physical names you must know: the **`facilities` table is physically named
    `items`** (`sqliteTable("items", …)`); **`inspections.facilityId` is
    physically column `item_id`**. Don't be surprised by FK targets showing
    `items` in generated SQL.
- **Test DB persists across tests within a file** → give each test its own org
  id (e.g. `org_phase_x`) to stay independent.
- **`fetcher.submit` JSON quirk:** a typed object isn't a `SubmitTarget`; round-
  trip it: `fetcher.submit(JSON.parse(JSON.stringify(body)), { method:"post",
  encType:"application/json" })`. Used throughout.
- **UI kit:** Tailwind v4 + shadcn/ui + **react-hook-form + zod** (forms) +
  **TanStack Table** (`app/components/ui/data-table.tsx`) + the shared
  `app/components/metadata-fields.tsx` (dynamic equipment fields). Responsive nav
  is in `layout.tsx` (hamburger < lg).
- **R2 is private.** Photos/files are served via authenticated
  `GET /api/uploads/:key` (Clerk session + org-prefix check), never a public
  URL. See memory `r2-private-bucket-policy`.

## Workflow commands

```
pnpm typecheck            # wrangler types + rr typegen + tsc
pnpm vitest run           # full suite (or pass a file path)
pnpm db:generate          # generate migration from schema; INSPECT the SQL
pnpm db:migrate:local     # apply locally
pnpm db:migrate:remote    # apply to prod D1 (verify empties before rebuilds)
pnpm run build && npx wrangler deploy   # deploy (use dangerouslyDisableSandbox in this env)
```
Smoke test after deploy: `curl -s -o /dev/null -w '%{http_code}' <url>/` and the
relevant `/api/...` (expect 401 unauth). Update `docs/roadmap.md` + check the
phase box when a slice ships.
