import { getAuth } from "@clerk/hono";
import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../types";

/**
 * Require a signed-in Clerk user with an active organization, and make the
 * local org mirror row available as `c.var.org`. Runs after clerkMiddleware()
 * and injectServices.
 */
export const requireOrg = createMiddleware<ApiEnv>(async (c, next) => {
  const auth = getAuth(c);

  if (!auth?.userId) {
    return c.json({ error: "unauthenticated" }, 401);
  }
  const orgId = auth.orgId;
  if (!orgId) {
    return c.json({ error: "no active organization" }, 403);
  }

  c.set("orgId", orgId);

  // Lazy-mirror the Clerk org; only hits the Clerk API on first sight.
  const org = await c.var.services.organizations.ensureOrg(orgId, async () => {
    const clerk = c.get("clerk");
    const clerkOrg = await clerk.organizations.getOrganization({
      organizationId: orgId,
    });
    return { name: clerkOrg.name, slug: clerkOrg.slug };
  });
  c.set("org", org);

  await next();
});
