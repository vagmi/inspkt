import type { Membership } from "./repositories/memberships-repo";
import type { Organization } from "./repositories/organizations-repo";
import type { User } from "./repositories/users-repo";
import type { Services } from "./services";

/** Hono environment for all API routes. */
export type ApiEnv = {
  Bindings: Env;
  Variables: {
    /** Per-request service container (set by injectServices). */
    services: Services;
    /** Active Clerk org id (set by requireOrg on authenticated routes). */
    orgId: string;
    /** Local mirror row for the active org (set by requireOrg). */
    org: Organization;
    /** Signed-in Clerk user id (set by requireOrg). */
    userId: string;
    /** Local mirror row for the signed-in user (set by requireOrg). */
    user: User;
    /** Clerk org role from the SESSION — the authorization authority. Gate on
     * this (via app/lib/capabilities.ts), never on `membership.role`. */
    orgRole: string | null;
    /** Local mirror of the active membership (data/display only — can lag a
     * webhook; never use it for authorization). */
    membership: Membership;
  };
};
