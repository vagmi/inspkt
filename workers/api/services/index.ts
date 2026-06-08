import { getDb } from "../db/client";
import { createItemsRepo } from "../repositories/items-repo";
import { createOrganizationsRepo } from "../repositories/organizations-repo";
import { createUsageRepo } from "../repositories/usage-repo";
import { createItemsService } from "./items-service";
import { createOrganizationsService } from "./organizations-service";

/**
 * Per-request service container. Wires repositories (the only DB access) and
 * external adapters into services. This is the spine of the app: add your
 * repo + service here and they're available as c.var.services everywhere.
 * Skills (billing, email, webhooks, uploads) plug their adapters in here.
 */
export function createServices(env: Env) {
  const db = getDb(env);
  const orgsRepo = createOrganizationsRepo(db);
  const usageRepo = createUsageRepo(db);
  const itemsRepo = createItemsRepo(db);

  return {
    organizations: createOrganizationsService({ orgsRepo }),
    items: createItemsService({ itemsRepo, usageRepo }),
  };
}

export type Services = ReturnType<typeof createServices>;
