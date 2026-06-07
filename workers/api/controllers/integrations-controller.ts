import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import { Hono } from "hono";
import { Webhook } from "svix";
import { injectServices } from "../middleware/services";
import type { PolarSubscriptionEvent } from "../services/billing-service";
import type { ClerkOrgEvent } from "../services/organizations-service";
import type { ApiEnv } from "../types";

export interface IntegrationVerifiers {
  /** (body, headers, secret) → parsed event; throws on bad signature */
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

/** /api/integrations — signature-verified receivers (no Clerk session).
 * Verifiers are injectable so controller tests don't need real signatures. */
export function createIntegrationsController(
  verifiers: IntegrationVerifiers = {},
) {
  const verify = { ...defaultVerifiers, ...verifiers };
  const app = new Hono<ApiEnv>();
  app.use(injectServices);

  // Polar → billing state. The single writer of organizations.plan.
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

  // Clerk → organization mirror sync. Optional: orgs are also mirrored lazily
  // on first authenticated request (see middleware/auth.ts requireOrg).
  app.post("/clerk", async (c) => {
    const body = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers);

    let event: unknown;
    try {
      event = verify.clerk(body, headers, c.env.CLERK_WEBHOOK_SECRET);
    } catch {
      return c.json({ error: "invalid signature" }, 403);
    }

    await c.var.services.organizations.syncFromClerk(event as ClerkOrgEvent);
    return c.json({ ok: true });
  });

  return app;
}
