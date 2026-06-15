import { getAuth } from "@clerk/hono";
import { createMiddleware } from "hono/factory";
import { actorFromRole, isAppRole, type Actor } from "~/lib/capabilities";
import type { ApiEnv } from "../types";

/**
 * Require a signed-in user (Clerk = authentication) with an active organization,
 * and make the local rows available on the request: `c.var.org`, `c.var.user`,
 * `c.var.membership`, plus `c.var.userId` / `c.var.orgId` / `c.var.role`.
 * Runs after clerkMiddleware() and injectServices.
 *
 * `c.var.role` is the APP role from our own membership row (the authorization
 * authority — see app/lib/capabilities.ts), seeded once from the provider on
 * first sight. The Clerk session role is used only as that seed, never to
 * authorize.
 */
/** Bearer scheme prefix for machine API keys. */
const API_KEY_BEARER = "Bearer inspkt_";

/**
 * Authenticate either a human Clerk session OR a machine API key, then set the
 * same request vars (`orgId`, `org`, `userId`, `role`, `authMethod`) so every
 * downstream `requireCapability(...)` gate works identically for both.
 *
 * An API key authenticates as a **manager-equivalent** actor scoped to its org
 * (full setup capability; no member/role/org management — those are admin-only
 * and additionally human-gated). The key carries its creator's user id, used
 * for attribution. Requests with `Authorization: Bearer inspkt_…` take the key
 * path; everything else falls back to the Clerk session.
 */
export const requireOrgOrApiKey = createMiddleware<ApiEnv>(async (c, next) => {
  const authz = c.req.header("Authorization");
  if (authz?.startsWith(API_KEY_BEARER)) {
    const token = authz.slice("Bearer ".length).trim();
    const result = await c.var.services.apiKeys.authenticate(token);
    if (!result) {
      return c.json({ error: "invalid api key" }, 401);
    }
    c.set("orgId", result.org.id);
    c.set("org", result.org);
    c.set("userId", result.createdByUserId);
    c.set("role", "manager");
    c.set("authMethod", "apikey");
    return next();
  }
  c.set("authMethod", "session");
  return requireOrg(c, next);
});

/**
 * Block machine API keys from a route — for actions that must be performed by a
 * signed-in human (e.g. minting/revoking API keys). 403s key-authenticated
 * requests; lets Clerk-session requests through.
 */
export const requireHuman = createMiddleware<ApiEnv>(async (c, next) => {
  if (c.var.authMethod === "apikey") {
    return c.json({ error: "this action requires a signed-in user" }, 403);
  }
  await next();
});

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
  // The provider's role — used ONLY to seed a new membership row, never to
  // authorize. App authorization reads c.var.role below.
  const providerRole = auth.orgRole ?? null;
  c.set("orgId", orgId);
  c.set("userId", userId);

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

  // Ensure the membership row exists, seeding its app role from the provider
  // ONCE; an existing app-owned role is returned untouched.
  const membership = await members.ensureMembership(orgId, userId, providerRole);
  c.set("membership", membership);
  // The authoritative app role for this request; unknown values (shouldn't
  // happen post-migration) fall back to least privilege.
  c.set("role", isAppRole(membership.role) ? membership.role : "inspector");

  await next();
});

/**
 * Gate a route on a capability from app/lib/capabilities.ts. The actor's role
 * is read from OUR membership row (`c.var.role`) — the app-owned authorization
 * authority, not the identity provider. 403s when the capability is not granted.
 *
 *   authed.delete("/:id", requireCapability(can.removeMember), handler)
 */
export function requireCapability(cap: (actor: Actor) => boolean) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const actor = actorFromRole(c.var.role);
    if (!cap(actor)) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  });
}
