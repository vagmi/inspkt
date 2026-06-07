# Starter

An opinionated, production-grade foundation for SaaS applications. It makes the
hard architectural decisions for you — authentication, multi-tenancy, a typed
data layer, and subscription billing — so you start from solid engineering
fundamentals instead of a blank page.

- 🔐 **Auth & multi-tenancy** — Clerk with organizations; every record is scoped to an org
- 🗄️ **Typed data layer** — Cloudflare D1 + Drizzle ORM with strict controller → service → repository layering and migrations
- 💳 **Billing** — Polar subscriptions, checkout, customer portal, and plan-based limits
- 🎨 **UI** — Tailwind v4 + shadcn/ui with a considered design system
- ✅ **Tested** — every layer ships with a spec; full type-checking across app and worker

Everything runs on a single Cloudflare Worker — React Router v7 (SSR) for the
app and a Hono API at `/api`, sharing one codebase and one deploy.

## Quick start

```bash
pnpm install
cp .dev.vars.example .dev.vars        # server secrets — fill in
cp .env.local.example .env.local      # browser Clerk key — fill in
npx wrangler d1 create starter-app  # create your D1 database
# paste the printed database_id into wrangler.jsonc
pnpm db:migrate:local
pnpm doctor                            # verifies your setup
pnpm dev
```

See **[docs/workshop.md](docs/workshop.md)** for the full setup checklist
(Clerk app + organizations, D1, Polar products) and a step-by-step guide.

## Architecture

Strict layering keeps the codebase predictable as it grows:

```
controller → service → repository → Drizzle/D1
```

Controllers validate input and shape responses; services own business rules
(plan gates, usage metering); repositories are the only place database queries
live, and every query is scoped to the active organization. React Router
loaders call the same Hono API in-process, so there is exactly one API surface.

Read **[docs/architecture.md](docs/architecture.md)** for the full design and
**[AGENTS.md](AGENTS.md)** for conventions and rules.

## The example resource

`items` is a complete vertical slice — schema, repository, service, controller,
dashboard UI, and tests, including a plan-based limit and live usage metering.
It's the reference pattern: copy it to add your own resource (duplicate the
schema, repo, service, controller, route, and tests, then rename `item` → your
domain object).

## Optional features (skills)

Capabilities you may or may not need ship as installable **skills**. Installing
one places its implementation guide and reference code into `.claude/skills/`,
ready for an AI coding agent to wire in:

```bash
pnpm install-skill                 # list available skills
pnpm install-skill email-resend    # install one
pnpm install-skill uninstall <n>   # remove one
```

| Skill | Adds |
| --- | --- |
| `email-resend` | Transactional email via Resend |
| `webhooks-svix` | Organization-scoped outbound webhooks (signed, retried, with a delivery log) |
| `widget-embed` | An embeddable `/widget.js` (Preact, shadow DOM) backed by a public API |
| `r2-uploads` | File uploads to a Cloudflare R2 bucket |

After installing, follow the printed checklist (env vars, bindings, deps); each
skill's `SKILL.md` contains exact integration steps and reference code.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check everything |
| `pnpm doctor` | Verify local setup |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate:local` | Apply migrations locally |
| `pnpm build` / `pnpm deploy` | Build / deploy to Cloudflare |

## Project layout

```
app/                React Router app (routes, components, lib)
workers/            Worker entry + Hono API (controllers/services/repositories/db)
drizzle/migrations  D1 migrations
skills/             Installable feature guides (the skill library)
tests/              vitest suites mirroring workers/api
docs/               architecture.md + workshop.md
```

## Tech stack

React Router v7 · Cloudflare Workers · Hono · D1 + Drizzle ORM · Clerk · Polar ·
Tailwind v4 · shadcn/ui · Vitest · pnpm.
