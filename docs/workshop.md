# Getting started

A step-by-step guide from clone to a deployed application — set up the
services, run it locally, build your domain on top, and ship.

## 0. Prerequisites

- Node 20+ and `pnpm` (`corepack enable`)
- A Cloudflare account (`npx wrangler login`)
- A Clerk account and a Polar **sandbox** account

## 1. Setup checklist (~20 min)

### Clerk

1. Create an application at https://dashboard.clerk.com.
2. **Enable Organizations** (Configure → Organizations → Enable). The app is
   org-scoped and won't work without it.
3. Copy the **Publishable key** and **Secret key**.
4. (Optional) Create a webhook → endpoint `https://<your-app>/api/integrations/clerk`,
   subscribe to `organization.*`, copy the signing secret. You can skip this —
   orgs are mirrored lazily on first login.

### Cloudflare D1

```bash
npx wrangler d1 create mudhal
```

Paste the printed `database_id` into `wrangler.jsonc` (replace
`REPLACE_WITH_YOUR_D1_DATABASE_ID`).

### Polar (sandbox)

1. Sign up at https://sandbox.polar.sh.
2. Create two **products**: "Pro" and "Business". Copy each product id.
3. Create an **organization access token**. Copy it.
4. (Optional) Create a webhook → `https://<your-app>/api/integrations/polar`,
   copy the signing secret. Locally you can rely on reconcile instead:
   `polar listen http://localhost:5173/api/integrations/polar`.

### Fill secrets

```bash
cp .dev.vars.example .dev.vars
cp .env.local.example .env.local
```

Fill in:

- `.dev.vars` — `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
  `POLAR_ACCESS_TOKEN`, `POLAR_PRO_PRODUCT_ID`, `POLAR_BIZ_PRODUCT_ID`,
  `POLAR_WEBHOOK_SECRET` (optional), `POLAR_SERVER=sandbox`, `APP_URL`.
- `.env.local` — `VITE_CLERK_PUBLISHABLE_KEY` (same publishable key).

### Run

```bash
pnpm install
pnpm db:migrate:local
pnpm doctor      # green-lights the above
pnpm dev
```

Sign up, create an organization, add an item, open Billing, click Upgrade.

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
`usageRepo.increment` — that's what makes Billing feel real.

### Pull in features as you need them

```bash
pnpm install-skill            # see the menu
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
npx wrangler secret put POLAR_ACCESS_TOKEN
# ...and the rest of the keys from .dev.vars

npx wrangler d1 migrations apply mudhal --remote
pnpm deploy
```

Set the production Clerk + Polar webhook URLs to your deployed
`https://<app>.workers.dev/api/integrations/*` endpoints.

## Troubleshooting

- **"Publishable key not valid"** — `.dev.vars` / `.env.local` still have
  placeholder keys. Run `pnpm doctor`.
- **Loaders 500 with a D1 error** — run `pnpm db:migrate:local`.
- **Upgrade didn't reflect** — the return path calls reconcile automatically;
  re-open Billing, or check `POLAR_SERVER=sandbox` and the product ids.
- **Type errors about `env.X`** — add the key to `workers/env.d.ts` (and
  `pnpm cf-typegen` after binding changes).
