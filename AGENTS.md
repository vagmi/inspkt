# AGENTS.md — Mudhal

An opinionated, production-grade foundation for SaaS applications: Clerk auth
with organizations, Cloudflare D1 + Drizzle, and plan-based usage limits —
architected and tested. The domain logic is yours to build on top (subscription
billing is an optional skill — see below). Read `docs/architecture.md` for the
full design before making structural changes.

The example resource is **`items`** — a complete controller → service →
repository → schema → UI → tests slice. Copy it to create your own resources.

## Renaming the app

The app is called **Mudhal** by default. To rename it, **do not hand-edit
files** — run the bundled `app-name` skill, which rewrites both the display name
and the slug (and `data-<slug>`/`--<slug>-*`/`<Slug>Widget`/`<slug>-uploads`)
everywhere in one pass:

```bash
node skills/app-name/references/rename-app.mjs "<New Name>" [new-slug]
```

Then run `pnpm cf-typegen && pnpm typecheck && pnpm test`. See
`skills/app-name/SKILL.md` for details and caveats (e.g. the D1 binding stays
`DB`, so the local database is unaffected).

## Stack

- **Runtime**: Cloudflare Workers — a single Worker serves both the API and the app
- **App**: React Router v7 (framework mode, SSR, `v8_middleware`) via `@cloudflare/vite-plugin`
- **API**: Hono mounted at `/api/*` in `workers/app.ts`
- **DB**: Cloudflare D1 + Drizzle ORM (`drizzle-kit` migrations in `drizzle/migrations/`)
- **Auth**: Clerk with Organizations (`@clerk/react-router` in the app, `@clerk/hono` in the API). The tenancy key is the Clerk `orgId`. The org, the signed-in **user**, and their **membership** (with role) are mirrored into D1 — lazily on first request and via Clerk webhooks (`organization.*`, `user.*`, `organizationMembership.*`).
- **Authorization**: every rule lives in one auditable file, `app/lib/capabilities.ts` (`can.*` predicates over an `Actor`). Gates read the **Clerk session** (live, signed) — never the D1 `memberships.role` mirror, which can lag a webhook. Enforce with `requireCapability(can.x)` on a route and call the same `can.x(actor)` in the UI.
- **Plans**: plan limits are config (`app/lib/plans.ts`); gates read `getPlan(plan)`
  and usage is metered in `usage_counters`. Every org is `free` until a billing
  integration moves it — **subscription billing ships as the optional
  `billing-polar` skill** (Polar checkout/portal/webhooks), not in the baseline.
- **UI**: Tailwind v4 (CSS-config in `app/app.css`, no `tailwind.config`) + shadcn/ui
- **Package manager**: pnpm (never npm/yarn)

## Skills

Optional features ship as **skills** in `skills/`. Install one with:

```
pnpm install-skill <name>     # copies skills/<name> → .claude/skills/<name>
pnpm install-skill            # list available skills
pnpm install-skill uninstall <name>
```

Claude only reads **installed** skills (those under `.claude/skills/`). After
installing, the printed checklist lists the env vars / wrangler bindings / deps
the feature needs; then ask Claude to wire it in (each skill's `SKILL.md` has
exact steps and reference code).

Available skills:

- **app-name** — rename the app to a custom name in one pass (see above)
- **billing-polar** — subscription billing via Polar (checkout, portal, webhooks, Billing page)
- **email-resend** — transactional email via Resend (plain fetch, no SDK)
- **webhooks-svix** — org-scoped outbound webhooks (signed, retried, delivery log)
- **widget-embed** — an embeddable Preact widget (`/widget.js`, shadow DOM) + public API
- **r2-uploads** — file uploads to a Cloudflare R2 bucket

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev server (Vite + Workers runtime) |
| `pnpm test` | Run all vitest suites (required before declaring work done) |
| `pnpm typecheck` | `wrangler types` + RR typegen + `tsc -b` |
| `pnpm doctor` | Check local setup (env vars, D1 id, migrations) |
| `pnpm db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm db:migrate:local` / `db:migrate:remote` | Apply D1 migrations |
| `pnpm build` | Production build |
| `pnpm deploy` | Build + `wrangler deploy` |

## Architecture rules (strict layering)

Request flow: **controller → service → repository → Drizzle/D1**. Never skip a layer.

- `workers/api/controllers/` — Hono sub-routers only. Validate input with
  `@hono/zod-validator` at the edge, call services, map results/domain errors to
  HTTP. **Controllers never import Drizzle or touch the DB.**
- `workers/api/services/` — business logic (plan gates, usage metering, "not
  found" semantics). **Services never import Hono types**; they take
  repos/adapters as plain dependencies and throw typed domain errors
  (`PlanLimitError`, `NotFoundError`, …) that controllers translate.
- `workers/api/repositories/` — the **only** place Drizzle queries live. No
  business logic, no HTTP concerns.
- **DI by factory functions**, no classes/containers: `createItemsRepo(db)`,
  `createItemsService({ itemsRepo, usageRepo })`. `createServices(env)` in
  `workers/api/services/index.ts` builds `c.var.services` per request.
- React Router loaders/actions never query D1 directly — they call the Hono app
  **in-process** via `app/lib/api-client.server.ts` (forwards cookies; no
  self-fetch). Client-side mutations hit `/api/*` same-origin.
- Shared domain code both app and worker need (`plans.ts`, `id.ts`) lives in
  `app/lib/` and stays free of React and Hono imports.
- Multi-tenancy: **every** repository query is scoped by `org_id`. Never trust a
  client-supplied org id — derive it from the Clerk session (`requireOrg`, which
  also sets `c.var.userId`, `c.var.user`, `c.var.orgRole`, and `c.var.membership`).
- Authorization: gate routes with `requireCapability(can.x)` and keep every rule
  in `app/lib/capabilities.ts`. Decide from the session role/permissions
  (`c.var.orgRole` / Clerk's `has()`), never from the `memberships.role` mirror.

## Testing (required for every layer)

Every repository, service, and controller ships with a spec. `tests/` mirrors
`workers/api/` and files are `*.test.ts`.

- **Repositories**: `@cloudflare/vitest-pool-workers` against real D1
  (miniflare); migrations applied in `tests/setup.ts`.
- **Services**: plain vitest with mocked repos/adapters (`vi.fn()` factories in
  `tests/helpers/mocks.ts`).
- **Controllers**: Hono `app.request()` with mocked services and stubbed auth.
  Assert status codes and validation failures.

## Styling & UI — "Paper & Ink" (a starting point)

The template ships an opinionated, polished design language. Tokens live in
`app/app.css` — never hardcode colors. Restyle freely; it's just a starting
point.

- **Type**: Fraunces (`font-heading`, all h1–h4) · Public Sans (`font-sans`,
  body) · IBM Plex Mono (`font-mono`, labels/data).
- **Accent**: vermilion (`--stamp`; utilities `text-stamp`, `bg-stamp`), used
  sparingly. Buttons stay ink (`--primary`).
- **Motifs** (utilities in app.css): `form-label-mono` (mono eyebrow),
  `rule-perforated` (dashed divider), `stamp` (rubber-stamp badge),
  `animate-fade-up`, `animate-stamp-in`.
- Tailwind v4: theme via `@theme`/CSS variables in `app/app.css` — there is no
  `tailwind.config.*`, don't create one.
- shadcn/ui components in `app/components/ui/` (alias `~/components/ui`); add
  more with `pnpm dlx shadcn@latest add <component>`.
- Clerk components are themed via `clerkAppearance` in `app/root.tsx`.
- The wordmark is `Mudhal*` — keep it in one place per page so renames are cheap.

## Conventions

- TypeScript everywhere, kebab-case filenames, ULID ids via `app/lib/id.ts`
  (exception: `organizations.id` is the Clerk org id).
- Timestamps are unix-epoch integers in D1.
- Validate all external input with zod at the controller edge
  (`workers/api/validation.ts`).
- Side effects (email, webhooks) run in `waitUntil(...)` — never block the response.
- New env vars: add them to `.dev.vars` AND `workers/env.d.ts` (so `tsc` passes
  on a fresh clone before `.dev.vars` exists).

## Secrets

- Local: `.dev.vars` (server) and `.env.local` (browser `VITE_*` Clerk keys) —
  both gitignored, **never commit secrets**. Production: `wrangler secret put`.
- Baseline keys: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
  `CLERK_WEBHOOK_SECRET` (optional), `APP_URL`. Skills add their own (e.g.
  `billing-polar` adds the `POLAR_*` keys).
- Orgs are mirrored into D1 lazily on first authenticated request, so the Clerk
  webhook is optional for local work.
- After changing `wrangler.jsonc` bindings, run `pnpm cf-typegen`.
