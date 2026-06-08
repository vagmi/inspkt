# Getting started

A step-by-step guide from clone to a deployed application — set up the
services, run it locally, build your domain on top, and ship.

> **Prefer a guided start?** In Claude Code, run **`/onboard`**. It drives the
> setup below to a green environment, interviews you about your app, and writes a
> phased roadmap of deployable vertical slices to `docs/roadmap.md`. This page is
> the manual version of the same path.

## 0. Prerequisites

- Node 20+ and `pnpm` (`corepack enable`)
- A Cloudflare account (`npx wrangler login`)
- A Clerk account (subscription billing is optional — add it later with the
  `billing-polar` skill)

## 1. Setup checklist (~20 min)

### Clerk

1. Create an application at https://dashboard.clerk.com.
2. **Enable Organizations** (Configure → Organizations → Enable). The app is
   org-scoped and won't work without it.
3. Copy the **Publishable key** and **Secret key**.
4. (Optional) Create a webhook → endpoint `https://<your-app>/api/integrations/clerk`,
   subscribe to `organization.*`, `user.*`, and `organizationMembership.*`, copy
   the signing secret. You can skip this — orgs, users, and the active
   membership are mirrored lazily on first request, and the Members page
   reconciles against the Clerk API.

### Cloudflare D1

```bash
npx wrangler d1 create mudhal
```

Paste the printed `database_id` into `wrangler.jsonc` (replace
`REPLACE_WITH_YOUR_D1_DATABASE_ID`).

### Fill secrets

```bash
cp .dev.vars.example .dev.vars
cp .env.local.example .env.local
```

Fill in:

- `.dev.vars` — `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `APP_URL`
  (and `CLERK_WEBHOOK_SECRET` only if you wire the org-sync webhook).
- `.env.local` — `VITE_CLERK_PUBLISHABLE_KEY` (same publishable key).

> Want paid plans? Install the **billing-polar** skill (`pnpm install-skill
> billing-polar`) — it prints the `POLAR_*` keys to add and the steps to wire up
> checkout, the customer portal, and webhooks.

### Run

```bash
pnpm install
pnpm db:migrate:local
pnpm doctor      # green-lights the above
pnpm dev
```

Sign up, create an organization, add an item, and open **Members** (invite a
teammate from the Clerk org switcher to see roles and the admin-only remove
action).

## 2. Build your domain

### Add a resource by copying `items`

`items` is a full vertical slice. To make `widgets` (or whatever your app is
about):

1. `workers/api/db/schema/items.ts` → `widgets.ts`; export it from `schema/index.ts`.
2. `pnpm db:generate && pnpm db:migrate:local`.
3. Copy `items-repo.ts`, `items-service.ts`, `items-controller.ts`,
   `validation.ts` entries — rename `item` → `widget`.
4. Register the service in `workers/api/services/index.ts` and the controller in
   `workers/api/index.ts` (inside the authed group).
5. Copy `app/routes/app/items-list.tsx` → `widgets-list.tsx`, add it to
   `app/routes.ts`.
6. Copy the tests in `tests/` and rename. Run `pnpm test`.

Tip: keep gating on the plan (`getPlan(plan).maxItems`) and metering with
`usageRepo.increment` — the gates are live even on the free plan, and they're
what makes the `billing-polar` skill feel real once you add paid tiers.

### Pull in features as you need them

```bash
pnpm install-skill            # see the menu
pnpm install-skill billing-polar   # add subscription billing (Polar)
pnpm install-skill email-resend
```

Follow the printed checklist, then ask Claude: *"wire up the email-resend skill
to send an email when an item is created."* Each skill's `SKILL.md` has exact
steps and reference code.

## 3. Deploy

```bash
# one-time: push secrets to the Worker
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put CLERK_PUBLISHABLE_KEY
# ...and any other keys from .dev.vars (skills add their own)

npx wrangler d1 migrations apply mudhal --remote
pnpm deploy
```

Set the production Clerk webhook URL (if you use it) to your deployed
`https://<app>.workers.dev/api/integrations/clerk` endpoint. (The `billing-polar`
skill adds its own `/api/integrations/polar` endpoint and deploy steps.)

## Troubleshooting

- **"Publishable key not valid"** — `.dev.vars` / `.env.local` still have
  placeholder keys. Run `pnpm doctor`.
- **Loaders 500 with a D1 error** — run `pnpm db:migrate:local`.
- **Type errors about `env.X`** — add the key to `workers/env.d.ts` (and
  `pnpm cf-typegen` after binding changes).
