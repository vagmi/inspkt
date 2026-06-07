import type { Organization } from "./repositories/organizations-repo";
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
  };
};
