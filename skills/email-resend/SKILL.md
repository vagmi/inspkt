---
name: email-resend
description: Send transactional email from the Worker via Resend (plain fetch, no SDK), wired into the service container.
user-invocable: false
metadata:
  author: builder-workshop
  version: 1.0.0
---

# Transactional email with Resend

Adds an email **adapter** (`createResendSender`) and an email **service**
(`createEmailService`) to the app, following the existing
adapter → service → DI-container pattern. After install, the app can send
transactional email (e.g. "your item was created") from any loader/action or
controller via `c.var.services.email`.

## Prerequisites

- A Resend account and API key — https://resend.com/api-keys
- Add to `.dev.vars`:
  - `RESEND_API_KEY=re_xxx`
  - `EMAIL_FROM=Mudhal <onboarding@resend.dev>` (the sandbox sender works
    without verifying a domain; use your own verified domain in production)
- Add both keys to `workers/env.d.ts` so `tsc` knows about them.

No new npm dependencies — the adapter uses `fetch`.

## Files to create

1. `workers/api/adapters/resend.ts` — copy from `references/resend-adapter.ts`.
2. `workers/api/services/email-service.ts` — copy from `references/email-service.ts`.
   Add one method per transactional email your app sends.

## Wiring

### 1. Declare the env vars (`workers/env.d.ts`)

```ts
interface Env {
  // ...existing baseline keys...
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
}
```

### 2. Register the service (`workers/api/services/index.ts`)

```ts
import { createResendSender } from "../adapters/resend";
import { createEmailService } from "./email-service";

export function createServices(env: Env) {
  // ...existing repos + adapters...
  const emailSender = createResendSender(env.RESEND_API_KEY, env.EMAIL_FROM);

  return {
    // ...existing services...
    email: createEmailService({ emailSender }),
  };
}
```

### 3. Send mail off the response path

In an action/controller, fire-and-forget with `waitUntil` so the request
isn't blocked on the email API:

```ts
import { waitUntil } from "cloudflare:workers";
// after creating the item:
waitUntil(c.var.services.email.sendItemCreated(userEmail, item.name));
```

(In a React Router action you can `await` it directly if you prefer; in the
Hono controller prefer `waitUntil`.)

## Verification

- `pnpm typecheck`
- Unit-test the service with a mocked sender (`{ send: vi.fn() }`) — assert the
  right subject/recipient, mirroring `tests/services/*`.
- Manual: trigger the action and confirm the email arrives (check the Resend
  dashboard logs). With the sandbox sender you can only deliver to the address
  that owns the Resend account until you verify a domain.

## Reference files

- `references/resend-adapter.ts`
- `references/email-service.ts`
