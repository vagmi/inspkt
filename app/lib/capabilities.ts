// ─────────────────────────────────────────────────────────────────────────
// CAPABILITIES — the single source of truth for "who is allowed to do what".
//
// Every authorization rule in the app lives here as a pure predicate over an
// `Actor`. Keeping the whole policy in one auditable file is deliberate: you (or
// a coding agent) can read the entire permission surface at a glance, and the
// worker middleware, the API controllers, and the UI all call the SAME function
// — so a check can never drift between "what the server enforces" and "what the
// button shows".
//
// SECURITY RULE: an Actor is built from the CLERK SESSION (signed, live,
// refreshed on Clerk's cadence) — never from the D1 membership mirror, which can
// lag a webhook. Gating on a stale mirror would be a privilege-escalation bug.
// Build actors with `actorFromAuth(getAuth(...))` only.
//
// HOW TO ADD A CAPABILITY:
//   1. Add a predicate to `can` below (uncomment a template or write a new one).
//   2. Enforce it server-side: `requireCapability(can.yourThing)` on the route,
//      or call `can.yourThing(actor, ...)` inside the controller for
//      resource-scoped checks.
//   3. Reflect it in the UI: call the same `can.yourThing(actor, ...)` to show
//      or hide the control.
//   4. Add a case to tests/lib/capabilities.test.ts.
// ─────────────────────────────────────────────────────────────────────────

/** A single role/permission check — exactly one of the two, matching Clerk's
 * `has()` (which is a discriminated union, not "both optional"). */
export type CapabilityCheck = { role: string } | { permission: string };

/** The acting user, derived from the Clerk session. `has` is Clerk's session
 * check — it understands both roles and fine-grained permissions. */
export interface Actor {
  /** Clerk org role from the session, e.g. "org:admin" | "org:member". */
  orgRole: string | null;
  /** Clerk's session predicate. Returns false for an unauthenticated actor. */
  has: (params: CapabilityCheck) => boolean;
}

/** Build an Actor from a Clerk auth object (`getAuth(c)` in the worker,
 * `getAuth(args)` in a loader). Tolerant of null so an unauthenticated caller
 * simply can do nothing. */
export function actorFromAuth(
  auth:
    | { orgRole?: string | null; has?: (params: CapabilityCheck) => boolean }
    | null
    | undefined,
): Actor {
  return {
    orgRole: auth?.orgRole ?? null,
    has: auth?.has ?? (() => false),
  };
}

const isAdmin = (actor: Actor): boolean => actor.has({ role: "org:admin" });

/**
 * The authorization policy. Each entry is a pure predicate — no I/O, no Clerk
 * imports — so it's trivially testable and callable from anywhere.
 */
export const can = {
  /** Any member of the active org can view the member list. */
  viewMembers: (_actor: Actor): boolean => true,

  /** Only org admins can remove a member. */
  removeMember: (actor: Actor): boolean => isAdmin(actor),

  // ── Templates — uncomment and adapt as your app grows. Keep EVERY rule here
  // ── so the whole policy stays auditable in one file. ──────────────────────
  //
  // /** Only admins can change another member's role. */
  // changeMemberRole: (actor: Actor): boolean => isAdmin(actor),
  //
  // /** Only admins can rename or delete the organization. */
  // manageOrganization: (actor: Actor): boolean => isAdmin(actor),
  //
  // /** Gate on a fine-grained Clerk permission instead of a role. Define the
  //  *  permission in the Clerk dashboard, then check it here. */
  // manageBilling: (actor: Actor): boolean =>
  //   actor.has({ permission: "org:billing:manage" }),
  //
  // /** Resource-scoped example: the creator or any admin may delete an item.
  //  *  Pass the resource + the acting user id as extra args. */
  // deleteItem: (
  //   actor: Actor,
  //   item: { createdBy: string },
  //   userId: string,
  // ): boolean => isAdmin(actor) || item.createdBy === userId,
};
