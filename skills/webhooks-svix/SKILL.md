---
name: webhooks-svix
description: Let organizations register outbound webhooks (signed, retried, with a delivery log) via Svix, gated on the plan.
user-invocable: false
metadata:
  author: builder-workshop
  version: 1.0.0
---

# Outbound webhooks with Svix

Lets each organization register webhook endpoints that receive signed,
retried event deliveries (Svix owns signing, retries, and the delivery log).
Adds a Svix **adapter**, a **service** (gated on the plan's `webhooks` flag),
and a **controller** at `/api/webhooks`.

Model mapping: Svix _application_ = organization (uid = Clerk org id), Svix
_endpoint_ = a webhook the org configured.

## Prerequisites

- A Svix account / API key — https://dashboard.svix.com
- Add to `.dev.vars`: `SVIX_API_KEY=sk_xxx`
- Add `SVIX_API_KEY: string` to `workers/env.d.ts`.

**No npm install needed** — `svix` is already a baseline dependency (the Clerk
webhook receiver uses it to verify signatures).

## Files to create

1. `workers/api/adapters/svix.ts` — copy from `references/svix-adapter.ts`.
2. `workers/api/services/webhooks-service.ts` — copy from `references/webhooks-service.ts`.
3. `workers/api/controllers/webhooks-controller.ts` — copy from `references/webhooks-controller.ts`.

## Wiring

### 1. Env type (`workers/env.d.ts`)

```ts
interface Env {
  // ...
  SVIX_API_KEY: string;
}
```

### 2. Register the service (`workers/api/services/index.ts`)

```ts
import { createSvixAdapter } from "../adapters/svix";
import { createWebhooksService } from "./webhooks-service";

export function createServices(env: Env) {
  // ...
  const svix = createSvixAdapter(env.SVIX_API_KEY);

  return {
    // ...
    webhooks: createWebhooksService({ svix }),
  };
}
```

### 3. Mount the controller (`workers/api/index.ts`)

Inside the **authed** group (so org context is present):

```ts
import { createWebhooksController } from "./controllers/webhooks-controller";
// ...
authed.route("/webhooks", createWebhooksController());
```

### 4. Emit an event when something happens

Wherever you want to notify subscribers — e.g. in `items-service.create` or
its controller — fan out off the response path:

```ts
import { waitUntil } from "cloudflare:workers";
import { ITEM_CREATED_EVENT } from "../adapters/svix";
// after creating the item:
waitUntil(
  c.var.services.webhooks // expose sendEvent, or call the adapter directly
    ? c.var.services.svix?.sendEvent(orgId, ITEM_CREATED_EVENT, { id: item.id })
    : Promise.resolve(),
);
```

> Tip: the cleanest place to emit is the service that owns the action. Either
> inject the `svix` adapter into `items-service` and call `sendEvent` there, or
> add a `notify` method to the webhooks service. Keep the controller thin.

## Verification

- `pnpm typecheck`
- Unit-test the service with a mocked adapter (`mockSvixAdapter`) — assert
  `create` throws `PlanLimitError` on the free plan and calls `ensureApp` then
  `createEndpoint` on a paid plan.
- Manual: as a paid-plan org, `POST /api/webhooks` with a https://webhook.site
  URL, create an item, and watch the delivery land (and appear under
  `GET /api/webhooks/:id/deliveries`).

## Reference files

- `references/svix-adapter.ts`
- `references/webhooks-service.ts`
- `references/webhooks-controller.ts`
