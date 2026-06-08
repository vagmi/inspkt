---
description: Onboard a new builder — set up a green environment, capture the app's goals, and produce a phased roadmap of deployable vertical slices in docs/roadmap.md.
---

# /onboard — from clone to a phased plan

You are onboarding someone onto the **Mudhal** starter kit (this repo). Your job
has two halves: **(1) get them to a green, running environment**, and **(2)
interview them about their app and turn it into a roadmap of small, deployable
vertical slices** written to `docs/roadmap.md`.

Be conversational and concrete. Do the boring checks yourself; only ask the human
for things you genuinely can't determine (account keys, product decisions,
interactive logins). Use `AskUserQuestion` for structured choices. For commands
that need an interactive login or the human's own terminal (e.g.
`npx wrangler login`), tell them to run it themselves by typing `! <command>` in
the prompt — you cannot complete browser logins for them.

This command is the AI companion to **`docs/workshop.md`** (the human guide) and
**`docs/architecture.md`** (the design). Reference those instead of repeating
them. Read `AGENTS.md` for the conventions you must respect when planning.

---

## Act 0 — Resume check (do this first)

Check whether `docs/roadmap.md` already exists.

- **If it exists**: read it, summarize the goals and which phases are done
  (`[x]`) vs pending (`[ ]`), and ask whether they want to (a) resume the next
  unchecked phase, (b) re-plan / add phases, or (c) start over. Do **not**
  silently overwrite an existing roadmap — only rewrite it if they choose (b)
  or (c). Then skip to the relevant act.
- **If it does not exist**: continue to Act 1.

---

## Act 1 — Setup: drive to a green environment

The goal of this act is a passing `pnpm doctor`, `pnpm typecheck`, and
`pnpm test`. Work through it, narrating what you find.

1. **Sense the current state.** Run `pnpm doctor` and read its output. It checks
   env vars, the D1 `database_id`, and migrations. Treat its findings as your
   to-do list for this act.

2. **Name the app.** Read `package.json`'s `name`. If it's still `mudhal`, ask
   if they want to rename the app now. If yes, run the bundled `app-name` skill
   (no install needed):
   ```bash
   node skills/app-name/references/rename-app.mjs "<Display Name>" [slug]
   ```
   then `pnpm cf-typegen`. (Renaming is optional and can be deferred — note it as
   Phase 0 in the roadmap if they skip it.)

3. **Services & secrets.** Walk the checklist in **`docs/workshop.md §1`**,
   confirming each item rather than re-explaining it. The non-obvious gotchas to
   call out explicitly:
   - **Clerk Organizations must be enabled** — the app is org-scoped and will not
     work otherwise.
   - **D1**: they run `! npx wrangler d1 create <slug>` themselves and paste the
     printed `database_id` into `wrangler.jsonc`.
   - Secrets go in `.dev.vars` (server) and `.env.local` (the `VITE_` Clerk key).
     Copy from the `.example` files. Never commit them.
   - **Billing is optional and NOT part of the baseline.** Clerk + D1 are all
     that's needed for a green environment. If paid plans are a goal, note it for
     the roadmap — it's the `billing-polar` skill (`pnpm install-skill
     billing-polar`), added in its own phase, not during setup.

4. **Bring it up green**, stopping to fix whatever fails:
   ```bash
   pnpm install
   pnpm db:migrate:local
   pnpm doctor
   pnpm typecheck
   pnpm test
   ```
   Do not start Act 2 until `pnpm doctor` is green — unless the human explicitly
   chooses to plan first and set up later. If they defer setup, say so plainly
   and record "finish setup" as Phase 0.

---

## Act 2 — Interview: what are we building?

Use `AskUserQuestion` (one question at a time is fine) to capture, at minimum:

1. **What the app does** — one or two sentences.
2. **Who the users are** — and whether they work in teams/organizations (this is
   already modeled: every record is scoped to a Clerk `orgId`).
3. **Core domain resources** — the 2–5 nouns the app is really about
   (e.g. "projects", "invoices", "leads"). These become vertical slices.
4. **The single most important first journey** — the one thing a user must be
   able to do for the app to be worth anything. This defines Phase 1.
5. **A billing/limit dimension, if any** — e.g. "free plan = 3 projects". The
   kit already has plan gates (`getPlan(plan).maxItems`) and usage metering
   (`usageRepo.increment`); map their limit onto that pattern.

Reflect their answers back in a short summary before planning.

---

## Act 3 — Plan: phased roadmap of vertical slices

Turn the app into an ordered list of phases and write `docs/roadmap.md`.

### The one rule: slices are vertical, never horizontal

Each phase must be a **vertical slice through every layer** for a single
capability, so it ends **deployable and demoable**:

```
db schema + migration
  → repository (org-scoped queries) + repo test
  → service (business rules, plan gates, domain errors) + service test
  → controller (Hono sub-router, zod validation) + controller test
  → app route (loader/action via api-client.server) + shadcn UI
```

Do **NOT** plan horizontally (a "do all the schemas" phase, then a "do all the
repositories" phase, …). Horizontal layering produces nothing shippable until
the very end. Every phase here must cross all layers for one feature and leave
`pnpm test` green and the app deployable.

This is exactly the shape of the existing **`items`** resource — schema →
repo → service → controller → route → tests. It is your template for every
slice. The "copy `items`" recipe in **`docs/workshop.md §2`** is the concrete
procedure; reference it from each phase.

### How to sequence

- **Phase 0 (only if needed)**: finish setup / rename the app — whatever was
  deferred in Act 1.
- **Phase 1 — smallest end-to-end slice**: usually rename the existing `items`
  slice into their first real resource (the one behind the "most important
  journey"). This reuses working code and gets them a real deploy fast.
- **Phases 2…N**: one resource or capability per phase, each its own vertical
  slice. Order by dependency and value — what unlocks the next thing, and what
  the user needs soonest.
- **Final phase — deploy**: secrets via `wrangler secret put`, remote
  migrations, `pnpm deploy`, production webhook URLs (see `docs/workshop.md §3`).

### Constraints every generated phase must respect (from AGENTS.md)

- Strict layering: controller → service → repository → Drizzle/D1; never skip a
  layer. Controllers never touch the DB; services never import Hono.
- **Every repository query is scoped by `org_id`** — derive the org from the
  Clerk session, never trust the client.
- **Authorization** goes in `app/lib/capabilities.ts` (one auditable file) and is
  enforced with `requireCapability(can.x)`; gate on the Clerk session role, never
  the `memberships.role` mirror. The session also exposes `c.var.userId` /
  `c.var.user` / `c.var.membership` for attribution and per-user data.
- Validate external input with zod at the controller edge.
- Every layer ships a test; `tests/` mirrors `workers/api/`.
- Side effects (email, webhooks) run in `waitUntil(...)`.

### Write `docs/roadmap.md`

Use the `Write` tool. Structure it so it doubles as a living checklist you can
resume from:

```markdown
# <App> — Roadmap

> Generated by /onboard. Check off phases as they ship. Each phase is a vertical
> slice and ends deployable.

## What we're building
<1–2 sentences> · **Users:** <who> · **Core resources:** <nouns>
**First journey:** <the must-have action>

## Phases

### [ ] Phase 1 — <name>
**Goal:** <user-visible outcome>
**Slice:** schema `…` → repo → service → controller → route `app/routes/app/…`
**Build:** <copy-items recipe / files to create, per docs/workshop.md §2>
**Done when:** sign in → <do the thing> → see it; `pnpm test` green; deploys.

### [ ] Phase 2 — <name>
…
```

After writing the file, tell the human it's saved, restate Phase 1, and offer to
start building it (or to resume later by running `/onboard` again).
