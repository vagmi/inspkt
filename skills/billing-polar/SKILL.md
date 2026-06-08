---
name: billing-polar
description: Add subscription billing with Polar — checkout, customer portal, plan upgrades and a usage/plans page, wired into the org's plan gates.
user-invocable: false
metadata:
  author: builder-workshop
  version: 1.0.0
---

# Subscription billing with Polar

Adds paid plans to the app: a Polar **adapter** (checkout, portal, subscription
lookup), a billing **service** (the single writer of the org's subscription
state), a `/api/billing` **controller**, a `/polar` webhook **receiver**, and a
**Billing page** that shows usage meters and lets an org upgrade.

The base template already ships the plan *config* (`app/lib/plans.ts`) and the
gates that honor it (e.g. `items-service` caps items by `getPlan(plan).maxItems`)
plus live usage metering (`usage_counters`). Out of the box every org is stuck on
`free`. **This skill adds the machinery to move an org onto a paid plan.**

Model mapping: a Polar **customer** = an organization (its Clerk org id rides
along as `externalCustomerId` + `metadata.orgId`, so webhook events resolve back
to the org). Polar **products** map to the `pro` / `business` plans via the two
product-id env vars.

## Prerequisites

- A Polar account — use the **sandbox** (https://sandbox.polar.sh) for the
  workshop.
- Two **products** (e.g. "Pro" and "Business"); copy each product id.
- An **organization access token**; copy it.
- Install the SDK: `pnpm add @polar-sh/sdk`
- Add to `.dev.vars` (and `workers/env.d.ts`): `POLAR_ACCESS_TOKEN`,
  `POLAR_WEBHOOK_SECRET` (optional locally), `POLAR_PRO_PRODUCT_ID`,
  `POLAR_BIZ_PRODUCT_ID`, `POLAR_SERVER=sandbox`.

## Files to create

1. `workers/api/adapters/polar.ts` — copy from `references/polar-adapter.ts`.
2. `workers/api/services/billing-service.ts` — copy from `references/billing-service.ts`.
3. `workers/api/controllers/billing-controller.ts` — copy from `references/billing-controller.ts`.
4. `app/routes/app/billing.tsx` — copy from `references/billing-route.tsx`.

## Patches to apply

5. **DB schema** — add the subscription columns + migration:
   `references/organizations-schema-patch.md`.
6. **Organizations repo** — add `updateBilling` + `BillingUpdate`:
   `references/organizations-repo-patch.md`.
7. **Polar webhook receiver** — add `/polar` to the integrations controller:
   `references/integrations-polar-patch.md`.

## Wiring

### 1. Env type (`workers/env.d.ts`)

```ts
interface Env {
  // ...
  POLAR_ACCESS_TOKEN: string;
  POLAR_WEBHOOK_SECRET: string;
  POLAR_PRO_PRODUCT_ID: string;
  POLAR_BIZ_PRODUCT_ID: string;
  POLAR_SERVER: string;
}
```

### 2. Register the service (`workers/api/services/index.ts`)

```ts
import { createPolarAdapter } from "../adapters/polar";
import { createBillingService } from "./billing-service";

export function createServices(env: Env) {
  // ...existing repos...
  const polar = createPolarAdapter({
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: env.POLAR_SERVER === "production" ? "production" : "sandbox",
  });

  return {
    // ...existing services...
    billing: createBillingService({
      polar,
      orgsRepo,
      usageRepo,
      itemsRepo,
      config: {
        proProductId: env.POLAR_PRO_PRODUCT_ID,
        bizProductId: env.POLAR_BIZ_PRODUCT_ID,
      },
    }),
  };
}
```

### 3. Mount the controller (`workers/api/index.ts`)

Inside the **authed** group:

```ts
import { createBillingController } from "./controllers/billing-controller";
// ...
authed.route("/billing", createBillingController());
```

### 4. Register the route (`app/routes.ts`)

Add the billing page inside the `app` layout, alongside `items`:

```ts
route("app", "routes/app/layout.tsx", [
  index("routes/app/items-list.tsx"),
  route("billing", "routes/app/billing.tsx"),
]),
```

### 5. Add a nav link (`app/routes/app/layout.tsx`)

```ts
const NAV = [
  { to: "/app", label: "Items", end: true },
  { to: "/app/billing", label: "Billing", end: false },
] as const;
```

## Billing flow (how it fits together)

1. The billing page links to `GET /api/billing/checkout?plan=pro`, which
   redirects to a Polar checkout (org id rides along as `externalCustomerId`).
2. On return (`?upgraded=1`) the loader calls `POST /api/billing/reconcile`,
   which pulls the active subscription straight from Polar and applies it — so a
   delayed/missed webhook never strands an upgrade (handy in local dev).
3. `POST /api/integrations/polar` is the authoritative, ongoing writer of the
   org's billing columns.

Locally you can rely on reconcile and skip the webhook listener, or run:
`polar listen http://localhost:5173/api/integrations/polar`.

## Verification

- `pnpm cf-typegen && pnpm typecheck`
- Unit-test the service with the mocked Polar adapter and repos (restore the
  `mockPolarAdapter` / `mockBillingService` factories in `tests/helpers/mocks.ts`
  if you removed them — see `references/billing-service.ts` for the shape). Assert
  `checkoutUrl` maps plan→product, `reconcile` applies an active sub, and
  `handlePolarEvent` flips the plan only on active + recognized product.
- Manual: sign in, open **Billing**, click **Upgrade to Pro**, complete the
  sandbox checkout, and confirm the plan reflects on return.

## Deploy

Push the new secrets to the Worker and set the production webhook URL:

```
wrangler secret put POLAR_ACCESS_TOKEN
wrangler secret put POLAR_WEBHOOK_SECRET
wrangler secret put POLAR_PRO_PRODUCT_ID
wrangler secret put POLAR_BIZ_PRODUCT_ID
wrangler secret put POLAR_SERVER
wrangler d1 migrations apply <slug> --remote
```

Point a Polar webhook at `https://<your-app>/api/integrations/polar`.

## Reference files

- `references/polar-adapter.ts`
- `references/billing-service.ts`
- `references/billing-controller.ts`
- `references/billing-route.tsx`
- `references/organizations-schema-patch.md`
- `references/organizations-repo-patch.md`
- `references/integrations-polar-patch.md`
