# Add the Polar webhook receiver

The base `integrations-controller.ts` only has the Clerk receiver. Add the
signature-verified Polar receiver so subscription events keep the org's billing
state in sync. Edit `workers/api/controllers/integrations-controller.ts`.

### 1. Imports (top of file)

```ts
import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import type { PolarSubscriptionEvent } from "../services/billing-service";
```

### 2. Add `polar` to the verifier interface + defaults

```ts
export interface IntegrationVerifiers {
  polar?: (
    body: string,
    headers: Record<string, string>,
    secret: string,
  ) => unknown;
  clerk?: (
    body: string,
    headers: Record<string, string>,
    secret: string,
  ) => unknown;
}

const defaultVerifiers: Required<IntegrationVerifiers> = {
  polar: (body, headers, secret) => validateEvent(body, headers, secret),
  clerk: (body, headers, secret) => new Webhook(secret).verify(body, headers),
};
```

### 3. Add the route (before the `/clerk` route)

```ts
  // Polar → billing state. The single writer of organizations' billing fields.
  app.post("/polar", async (c) => {
    const body = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers);

    let event: unknown;
    try {
      event = verify.polar(body, headers, c.env.POLAR_WEBHOOK_SECRET);
    } catch (e) {
      if (e instanceof WebhookVerificationError || e instanceof Error) {
        return c.json({ error: "invalid signature" }, 403);
      }
      throw e;
    }

    await c.var.services.billing.handlePolarEvent(
      event as PolarSubscriptionEvent,
    );
    return c.json({ ok: true });
  });
```

This route lives inside the existing `/integrations` group, which is registered
**before** the authed group in `workers/api/index.ts` — so it never hits
`requireOrg` (no Clerk session on a webhook). No change needed there.
