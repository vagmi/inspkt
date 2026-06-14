// ─────────────────────────────────────────────────────────────────────────
// CAPABILITIES — the single source of truth for "who is allowed to do what".
//
// AUTHORIZATION IS OWNED BY THE APP, NOT THE IDENTITY PROVIDER.
// Clerk (or Cognito/Keycloak later) answers only "who is this and which org is
// active" — authentication + identity. The *role* a user holds in an org, and
// every "can they do X" decision, lives here and in our own database
// (`memberships.role`). Swapping identity providers means re-pointing where
// `userId` / `orgId` come from; this policy file and the role model stay put.
//
// Because the role is stored in OUR D1 (read fresh in the same request), there
// is no provider-webhook lag to worry about — `memberships.role` is the
// authority. (This inverts the old rule that gated on the Clerk session and
// treated the mirror as untrusted: the mirror is now the source of truth,
// seeded once from the provider at membership creation, then app-managed.)
//
// Every rule is a pure predicate over an `Actor` so the worker middleware, the
// API controllers, and the UI all call the SAME function — a check can never
// drift between what the server enforces and what the UI shows.
//
// HOW TO ADD A CAPABILITY:
//   1. Add a predicate to `can` below.
//   2. Enforce it server-side: `requireCapability(can.yourThing)` on the route.
//   3. Reflect it in the UI with the same `can.yourThing(actor)`.
//   4. Add a case to tests/lib/capabilities.test.ts.
// ─────────────────────────────────────────────────────────────────────────

/** The roles inspkt understands, most to least privileged. Stored verbatim in
 * `memberships.role`. */
export type AppRole = "admin" | "manager" | "inspector";

export const APP_ROLES: readonly AppRole[] = ["admin", "manager", "inspector"];

export function isAppRole(value: string | null | undefined): value is AppRole {
  return value != null && (APP_ROLES as readonly string[]).includes(value);
}

/** The acting user, reduced to the one thing authorization depends on: their
 * app role in the active org. `null` means "no membership / unknown role" → can
 * do nothing. */
export interface Actor {
  role: AppRole | null;
}

/** Build an Actor from a role string read out of our own database
 * (`c.var.role` in the worker, `me.role` in a loader). Unknown/missing → no
 * access. This is the ONLY constructor — there is intentionally no
 * `actorFromAuth`, so nothing can accidentally authorize off the provider. */
export function actorFromRole(role: string | null | undefined): Actor {
  return { role: isAppRole(role) ? role : null };
}

const is = (actor: Actor, ...roles: AppRole[]): boolean =>
  actor.role != null && roles.includes(actor.role);

/**
 * The authorization policy. Pure predicates — no I/O, no provider imports.
 *
 * Role summary:
 *   admin     — sets up the instance, manages members + roles, everything below
 *   manager   — oversees: manages clients/facilities/equipment/forms, assigns
 *   inspector — performs the inspections assigned to them
 */
export const can = {
  /** Any member can perform inspections assigned to them. */
  inspect: (a: Actor): boolean => is(a, "admin", "manager", "inspector"),

  /** Any member can see who else is in the org. */
  viewMembers: (a: Actor): boolean => is(a, "admin", "manager", "inspector"),

  /** Manage the setup data: clients, facilities, equipment, forms. */
  setup: (a: Actor): boolean => is(a, "admin", "manager"),

  /** Assign inspections to inspectors (Phase 10). */
  assign: (a: Actor): boolean => is(a, "admin", "manager"),

  /** See oversight views: dashboards, reports across the org. */
  oversee: (a: Actor): boolean => is(a, "admin", "manager"),

  /** Change another member's role. Admins only. */
  manageRoles: (a: Actor): boolean => is(a, "admin"),

  /** Remove a member from the org. Admins only. */
  removeMember: (a: Actor): boolean => is(a, "admin"),

  /** Rename or delete the organization. Admins only. */
  manageOrg: (a: Actor): boolean => is(a, "admin"),
};

/** Where to send a user after sign-in, by role. Managers/admins land on the
 * setup side; inspectors go straight to their work. */
export function landingPath(actor: Actor): string {
  return can.setup(actor) ? "/app" : "/app/inspections";
}

// ── Provider seam ──────────────────────────────────────────────────────────
// The ONE place that maps an identity provider's notion of role to ours. Used
// only to seed a brand-new membership row (the org creator is the provider's
// admin → our admin; everyone else starts as an inspector and is promoted
// in-app). After seeding, the app owns the role and never reads this again.
// To swap providers, change just this function.
export function seedRoleFromProvider(
  providerRole: string | null | undefined,
): AppRole {
  return providerRole === "org:admin" ? "admin" : "inspector";
}
