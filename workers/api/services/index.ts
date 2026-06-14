import { getDb } from "../db/client";
import { createClientsRepo } from "../repositories/clients-repo";
import { createEquipmentRepo } from "../repositories/equipment-repo";
import { createEquipmentTypesRepo } from "../repositories/equipment-types-repo";
import { createFacilitiesRepo } from "../repositories/facilities-repo";
import { createFormsRepo } from "../repositories/forms-repo";
import { createInspectionsRepo } from "../repositories/inspections-repo";
import { createMembershipsRepo } from "../repositories/memberships-repo";
import { createOrganizationsRepo } from "../repositories/organizations-repo";
import { createUsageRepo } from "../repositories/usage-repo";
import { createUsersRepo } from "../repositories/users-repo";
import { createClientsService } from "./clients-service";
import { createEquipmentService } from "./equipment-service";
import { createEquipmentTypesService } from "./equipment-types-service";
import { createFacilitiesService } from "./facilities-service";
import { createFormsService } from "./forms-service";
import { createInspectionsService } from "./inspections-service";
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
  const facilitiesRepo = createFacilitiesRepo(db);
  const formsRepo = createFormsRepo(db);
  const inspectionsRepo = createInspectionsRepo(db);
  const clientsRepo = createClientsRepo(db);
  const equipmentTypesRepo = createEquipmentTypesRepo(db);
  const equipmentRepo = createEquipmentRepo(db);

  return {
    organizations: createOrganizationsService({ orgsRepo }),
    users: createUsersService({ usersRepo }),
    members: createMembersService({ membershipsRepo, usersRepo }),
    facilities: createFacilitiesService({
      facilitiesRepo,
      clientsRepo,
      usageRepo,
    }),
    forms: createFormsService({ formsRepo }),
    inspections: createInspectionsService({
      inspectionsRepo,
      facilitiesRepo,
      formsRepo,
    }),
    clients: createClientsService({ clientsRepo }),
    equipmentTypes: createEquipmentTypesService({
      equipmentTypesRepo,
      equipmentRepo,
      formsRepo,
    }),
    equipment: createEquipmentService({
      equipmentRepo,
      clientsRepo,
      facilitiesRepo,
      equipmentTypesRepo,
    }),
    uploads: createUploadsService({ bucket: env.UPLOADS }),
  };
}

export type Services = ReturnType<typeof createServices>;
