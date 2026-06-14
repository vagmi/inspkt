import { getDb } from "../db/client";
import { createFormsRepo } from "../repositories/forms-repo";
import { createInspectionsRepo } from "../repositories/inspections-repo";
import { createItemsRepo } from "../repositories/items-repo";
import { createMembershipsRepo } from "../repositories/memberships-repo";
import { createOrganizationsRepo } from "../repositories/organizations-repo";
import { createUsageRepo } from "../repositories/usage-repo";
import { createUsersRepo } from "../repositories/users-repo";
import { createFormsService } from "./forms-service";
import { createInspectionsService } from "./inspections-service";
import { createItemsService } from "./items-service";
import { createUploadsService } from "./uploads-service";
import { createMembersService } from "./members-service";
import { createOrganizationsService } from "./organizations-service";
import { createUsersService } from "./users-service";

/**
 * Per-request service container. Wires repositories (the only DB access) and
 * external adapters into services. This is the spine of the app: add your
 * repo + service here and they're available as c.var.services everywhere.
 * Skills (billing, email, webhooks, uploads) plug their adapters in here.
 */
export function createServices(env: Env) {
  const db = getDb(env);
  const orgsRepo = createOrganizationsRepo(db);
  const usersRepo = createUsersRepo(db);
  const membershipsRepo = createMembershipsRepo(db);
  const usageRepo = createUsageRepo(db);
  const itemsRepo = createItemsRepo(db);
  const formsRepo = createFormsRepo(db);
  const inspectionsRepo = createInspectionsRepo(db);

  return {
    organizations: createOrganizationsService({ orgsRepo }),
    users: createUsersService({ usersRepo }),
    members: createMembersService({ membershipsRepo, usersRepo }),
    items: createItemsService({ itemsRepo, usageRepo }),
    forms: createFormsService({ formsRepo }),
    inspections: createInspectionsService({
      inspectionsRepo,
      itemsRepo,
      formsRepo,
    }),
    uploads: createUploadsService({ bucket: env.UPLOADS }),
  };
}

export type Services = ReturnType<typeof createServices>;
