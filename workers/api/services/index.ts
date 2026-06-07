import { createPolarAdapter } from "../adapters/polar";
import { getDb } from "../db/client";
import { createItemsRepo } from "../repositories/items-repo";
import { createOrganizationsRepo } from "../repositories/organizations-repo";
import { createUsageRepo } from "../repositories/usage-repo";
import { createBillingService } from "./billing-service";
import { createItemsService } from "./items-service";
import { createOrganizationsService } from "./organizations-service";

/**
 * Per-request service container. Wires repositories (the only DB access) and
 * external adapters (e.g. Polar) into services. This is the spine of the app:
 * add your repo + service here and they're available as c.var.services
 * everywhere. Skills (email, webhooks, uploads) plug their adapters in here.
 */
export function createServices(env: Env) {
  const db = getDb(env);
  const orgsRepo = createOrganizationsRepo(db);
  const usageRepo = createUsageRepo(db);
  const itemsRepo = createItemsRepo(db);

  const polar = createPolarAdapter({
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: env.POLAR_SERVER === "production" ? "production" : "sandbox",
  });

  return {
    billing: createBillingService({
      polar,
      orgsRepo,
      usageRepo,
      itemsRepo,
      config: {
        proProductId: env.POLAR_PRO_PRODUCT_ID,
        bizProductId: env.POLAR_BIZ_PRODUCT_ID,
      },
    }),
    organizations: createOrganizationsService({ orgsRepo }),
    items: createItemsService({ itemsRepo, usageRepo }),
  };
}

export type Services = ReturnType<typeof createServices>;
