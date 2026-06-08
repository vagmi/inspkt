import { Hono } from "hono";
import { Webhook } from "svix";
import { injectServices } from "../middleware/services";
import type { ClerkMembershipEvent } from "../services/members-service";
import type { ClerkOrgEvent } from "../services/organizations-service";
import type { ClerkUserEvent } from "../services/users-service";
import type { ApiEnv } from "../types";

export interface IntegrationVerifiers {
  /** (body, headers, secret) → parsed event; throws on bad signature */
  clerk?: (
    body: string,
    headers: Record<string, string>,
    secret: string,
  ) => unknown;
}

const defaultVerifiers: Required<IntegrationVerifiers> = {
  clerk: (body, headers, secret) => new Webhook(secret).verify(body, headers),
};

/** /api/integrations — signature-verified receivers (no Clerk session).
 * Verifiers are injectable so controller tests don't need real signatures.
 * The billing-polar skill adds a `/polar` receiver here. */
export function createIntegrationsController(
  verifiers: IntegrationVerifiers = {},
) {
  const verify = { ...defaultVerifiers, ...verifiers };
  const app = new Hono<ApiEnv>();
  app.use(injectServices);

  // Clerk → local mirror sync. Optional: orgs/users/memberships are also
  // mirrored lazily on first authenticated request (see middleware/auth.ts
  // requireOrg), so the webhook only matters for changes the active user
  // doesn't make themselves (e.g. another admin removes a member).
  //
  // Dispatch by event prefix. The trailing dot matters:
  // "organizationMembership.*" does NOT match the "organization." prefix.
  app.post("/clerk", async (c) => {
    const body = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers);

    let event: unknown;
    try {
      event = verify.clerk(body, headers, c.env.CLERK_WEBHOOK_SECRET);
    } catch {
      return c.json({ error: "invalid signature" }, 403);
    }

    const { type } = event as { type: string };
    const { organizations, users, members } = c.var.services;
    if (type.startsWith("organizationMembership.")) {
      await members.syncFromClerk(event as ClerkMembershipEvent);
    } else if (type.startsWith("organization.")) {
      await organizations.syncFromClerk(event as ClerkOrgEvent);
    } else if (type.startsWith("user.")) {
      await users.syncFromClerk(event as ClerkUserEvent);
    }
    return c.json({ ok: true });
  });

  return app;
}
