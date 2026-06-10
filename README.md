# Mudhal

An opinionated, production-grade foundation for SaaS applications. It makes the
hard architectural decisions for you (authentication, multi-tenancy, a typed
data layer, and subscription billing). So you start from solid engineering
fundamentals instead of a blank page.

- 🔐 **Auth & multi-tenancy** — Clerk with organizations; users, memberships & roles mirrored into D1; every record scoped to an org
- 🛡️ **Authorization** — one auditable policy file (`app/lib/capabilities.ts`); role checks read the live Clerk session, enforced server-side and reflected in the UI
- 🗄️ **Typed data layer** — Cloudflare D1 + Drizzle ORM with strict controller → service → repository layering and migrations
- 💳 **Pricing Plans & limits** — tier-based gating and live usage metering built in; subscription billing (Polar) is one skill away
- 🎨 **UI** — Tailwind v4 + shadcn/ui with a considered design system
- ✅ **Tested** — every layer ships with a spec; full type-checking across app and worker

Everything runs on a single Cloudflare Worker — React Router v7 (SSR) for the
app and a Hono API at `/api`, sharing one codebase and one deploy.

## Claude Code - Quick Start

Open Claude Code and run **`/onboard`** — it walks you through
setup to a green environment, interviews you about your app, and writes a phased
roadmap of small, deployable vertical slices to `docs/roadmap.md`.

## Non-AI - Quick Start (if you prefer to do it manually)

```bash
pnpm install
cp .dev.vars.example .dev.vars        # server secrets — fill in
cp .env.local.example .env.local      # browser Clerk key — fill in
npx wrangler d1 create mudhal  # create your D1 database
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
(tier gates, usage metering); repositories are the only place database queries
live, and every query is scoped to the active organization. React Router
loaders call the same Hono API in-process, so there is exactly one API surface.

Read **[docs/architecture.md](docs/architecture.md)** for the full design and
**[AGENTS.md](AGENTS.md)** for conventions and rules.

## The example resource

`items` is a complete vertical slice — schema, repository, service, controller,
dashboard UI, and tests, including a tier-based limit and live usage metering.
It's the reference pattern: copy it to add your own resource (duplicate the
schema, repo, service, controller, route, and tests, then rename `item` → your
domain object).

## Optional features (skills)

The base template is designed to be lean. You can add more features by using the skills shipped with this project.
Capabilities you may or may not need ship as installable **skills**. Installing
the skill places its implementation guide and reference code into `.claude/skills/`,
ready for an AI coding agent to wire in:

```bash
pnpm install-skill                 # list available skills
pnpm install-skill email-resend    # install one
pnpm install-skill uninstall <n>   # remove one
```

| Skill | Adds |
| --- | --- |
| `app-name` | Rename the app to your own name in one pass |
| `billing-polar` | Subscription billing via Polar (checkout, portal, webhooks, Billing page) |
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

React Router v7 · Cloudflare Workers · Hono · D1 + Drizzle ORM · Clerk ·
Tailwind v4 · shadcn/ui · Vitest · pnpm. (Polar billing available as a skill.)
