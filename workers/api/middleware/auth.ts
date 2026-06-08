import { getAuth } from "@clerk/hono";
import { createMiddleware } from "hono/factory";
import { actorFromAuth, type Actor } from "~/lib/capabilities";
import type { ApiEnv } from "../types";

/**
 * Require a signed-in Clerk user with an active organization, and make the local
 * mirror rows available on the request: `c.var.org`, `c.var.user`,
 * `c.var.membership`, plus `c.var.userId` / `c.var.orgId` / `c.var.orgRole`.
 * Runs after clerkMiddleware() and injectServices.
 *
 * `orgRole` comes from the session (the live source of truth for authorization);
 * the mirror rows exist for data/display and are filled lazily (only the first
 * request for a given org/user/role hits the Clerk API).
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

  const userId = auth.userId;
  const orgRole = auth.orgRole ?? null;
  c.set("orgId", orgId);
  c.set("userId", userId);
  c.set("orgRole", orgRole);

  const clerk = c.get("clerk");
  const { organizations, users, members } = c.var.services;

  // Lazy-mirror the Clerk org; only hits the Clerk API on first sight.
  const org = await organizations.ensureOrg(orgId, async () => {
    const clerkOrg = await clerk.organizations.getOrganization({
      organizationId: orgId,
    });
    return { name: clerkOrg.name, slug: clerkOrg.slug };
  });
  c.set("org", org);

  // Lazy-mirror the signed-in user.
  const user = await users.ensureUser(userId, async () => {
    const u = await clerk.users.getUser(userId);
    const primary =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ??
      u.emailAddresses[0];
    return {
      email: primary?.emailAddress ?? "",
      firstName: u.firstName,
      lastName: u.lastName,
      imageUrl: u.imageUrl,
    };
  });
  c.set("user", user);

  // Lazy-mirror the membership with the role from the session.
  const membership = await members.ensureMembership(
    orgId,
    userId,
    orgRole ?? "org:member",
  );
  c.set("membership", membership);

  await next();
});

/**
 * Gate a route on a capability from app/lib/capabilities.ts. The actor's role /
 * permissions are read from the CLERK SESSION (signed, live) — never from the
 * D1 membership mirror, which can lag a webhook. 403s when the capability is
 * not granted.
 *
 *   authed.delete("/:id", requireCapability(can.removeMember), handler)
 */
export function requireCapability(cap: (actor: Actor) => boolean) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const actor = actorFromAuth(getAuth(c));
    if (!cap(actor)) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  });
}
