# Architecture

A single Cloudflare Worker serves everything. `workers/app.ts` routes
`/api/*` to the Hono API and every other path to the React Router SSR handler.

```
Browser ─┬─ GET /            ─► React Router SSR ─► loaders ─┐
         │                                                   │ (in-process)
         └─ fetch /api/items ─► Hono API ────────────────────┴─► services ─► repositories ─► D1
```

React Router loaders/actions don't talk to D1 directly — they call the Hono app
**in-process** through `app/lib/api-client.server.ts` (forwarding the session
cookie). So there is exactly one API surface, used identically by the server and
the browser.

## Layering (controller → service → repository)

| Layer | Directory | Responsibility | Must not |
| --- | --- | --- | --- |
| Controller | `workers/api/controllers/` | Validate input (zod), call a service, shape JSON / map domain errors | import Drizzle, hold business logic |
| Service | `workers/api/services/` | Business rules: plan gates, usage metering, not-found semantics | import Hono, query the DB |
| Repository | `workers/api/repositories/` | All Drizzle queries, every one scoped by `org_id` | hold business logic or HTTP concerns |

Dependencies are wired by **factory functions**, not classes. `createServices(env)`
(`workers/api/services/index.ts`) builds the per-request container exposed as
`c.var.services`. This is the spine — add a repo + service here and it's
available everywhere. Skills plug their adapters in at this one place.

Typed domain errors (`workers/api/services/errors.ts`) are thrown by services
and translated to HTTP by `controllers/error-handler.ts`:
`NotFoundError → 404`, `PlanLimitError → 402`, `UsageLimitError → 429`,
`ValidationError → 422`.

## Data model

Baseline tables (`workers/api/db/schema/`):

- **organizations** — local mirror of the Clerk org. `id` *is* the Clerk org id
  (Clerk is the identity source of truth). `plan` drives the gates and defaults
  to `free`; the optional `billing-polar` skill adds the subscription columns
  and the receiver that writes them.
- **users** — local mirror of the Clerk user (`id` *is* the Clerk user id).
  Global (a user can belong to many orgs). Exists so the app can FK against,
  attribute, and display people — not for authorization.
- **memberships** — the User ↔ Organization link with a `role`, mirroring
  Clerk's model. PK `(org_id, user_id)`. The `role` column is a display/data
  mirror that can lag a webhook — **never gate on it**.
- **usage_counters** — per-org, per-month (`YYYY-MM`) metered `count`. Atomic
  upsert-increment on each metered action; one row read per limit check.
- **items** — the example resource. Org-scoped; copy it for your own data.

Users and memberships are mirrored lazily (the active user/membership on first
request) and kept in sync by Clerk `user.*` / `organizationMembership.*`
webhooks; the Members page additionally reconciles against the Clerk API so the
list is always complete.

Plan limits live in **config**, not the DB (`app/lib/plans.ts`): changing a
limit is a deploy, not a migration, and gates read zero extra rows. `getPlan()`
resolves a plan; gates compare counts against it.

## Auth & tenancy

- The app wraps everything in `ClerkProvider` with `clerkMiddleware` +
  `rootAuthLoader` (`app/root.tsx`). The `/app` layout loader redirects to
  `/sign-in` (no user) or `/app/select-org` (no active org).
- The API's `requireOrg` middleware (`workers/api/middleware/auth.ts`) requires
  a signed-in user **and** an active org, then lazily mirrors the Clerk org,
  user, and membership into D1 — so the Clerk webhook is optional. It sets
  `c.var.orgId`, `c.var.org`, `c.var.userId`, `c.var.user`, `c.var.orgRole`
  (from the session), and `c.var.membership`; every repository query scopes to
  the org id.

## Authorization

All authorization rules live in one auditable file, **`app/lib/capabilities.ts`**
— `can.*` predicates over an `Actor`. The worker middleware, the API
controllers, and the UI all call the same predicate, so "what the server
enforces" and "what the button shows" cannot drift.

The security rule: an `Actor` is built from the **Clerk session**
(`actorFromAuth(getAuth(...))`) — signed, live, refreshed on Clerk's cadence —
**never** from the `memberships.role` mirror, which can lag a webhook (gating on
a stale mirror would be a privilege-escalation bug). Gate routes with
`requireCapability(can.x)`; for resource-scoped checks call `can.x(actor, …)`
inside the controller.

## API surface

Registration order matters in `workers/api/index.ts` — public/receiver routes
are registered **before** the authed group so they match first and never hit
`requireOrg`:

- `GET /api/health` — liveness
- `POST /api/integrations/clerk` — Clerk webhook (signature-verified); dispatched
  by event prefix to the organizations / users / members services
- **authed** (Clerk session + active org): `GET /api/me`, `/api/items/*`,
  `/api/members/*` (list; `DELETE` is admin-gated via `requireCapability`)

Skills extend this: `billing-polar` adds `/api/billing/*` and a
`/api/integrations/polar` receiver, `widget-embed` adds a public `/api/public/*`
group, `webhooks-svix` adds `/api/webhooks/*`, `r2-uploads` adds `/api/uploads`.

## Plans & billing

Plan *config* and gating are built in (`app/lib/plans.ts`, `getPlan()`, the
`items` limit, `usage_counters`). Every org stays on `free` until a billing
integration moves it. **Subscription billing is the optional `billing-polar`
skill** — it adds Polar checkout (`GET /api/billing/checkout`), reconcile on
return (`POST /api/billing/reconcile`, self-heals a missed webhook), and the
authoritative `POST /api/integrations/polar` receiver that writes billing state.

## Testing

Three layers, three styles (`tests/`): repositories run against real D1
(miniflare, migrations applied in `tests/setup.ts`); services use mocked
repos/adapters; controllers use Hono `app.request()` with mocked services and
stubbed auth. Mock factories live in `tests/helpers/mocks.ts`.

## Configuration

- `.dev.vars` — server secrets (gitignored). `.env.local` — browser `VITE_*`
  Clerk keys. `workers/env.d.ts` declares the secret env types so `tsc` passes
  before `.dev.vars` exists; add new keys there too.
- `wrangler.jsonc` — Worker config + D1 binding. Commented `assets` / `r2`
  blocks are uncommented by the widget / uploads skills. Run `pnpm cf-typegen`
  after binding changes.
