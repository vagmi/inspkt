import type { AppRole } from "~/lib/capabilities";
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
    /** Signed-in user id from the identity provider (set by requireOrg). */
    userId: string;
    /** Local row for the signed-in user (set by requireOrg). */
    user: User;
    /** The active membership row (set by requireOrg). */
    membership: Membership;
    /** The APP role for this request, from our membership row — the
     * authorization authority. Gate on this via app/lib/capabilities.ts. */
    role: AppRole;
    /** How this request authenticated: a human Clerk session, or a machine
     * API key. Routes that must stay human-only gate on this via requireHuman.
     * Set by requireOrgOrApiKey. */
    authMethod: "session" | "apikey";
  };
};
