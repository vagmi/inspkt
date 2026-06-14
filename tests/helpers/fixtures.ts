import { env } from "cloudflare:test";
import { getDb, type Db } from "../../workers/api/db/client";
import {
  createClientsRepo,
  type Client,
} from "../../workers/api/repositories/clients-repo";
import {
  createEquipmentRepo,
  type Equipment,
} from "../../workers/api/repositories/equipment-repo";
import {
  createEquipmentTypesRepo,
  type EquipmentType,
} from "../../workers/api/repositories/equipment-types-repo";
import {
  createFormsRepo,
  type CheckpointInput,
  type FormWithCheckpoints,
} from "../../workers/api/repositories/forms-repo";
import {
  createInspectionsRepo,
  type InspectionWithObservations,
} from "../../workers/api/repositories/inspections-repo";
import {
  createFacilitiesRepo,
  type Facility,
} from "../../workers/api/repositories/facilities-repo";
import { createMembershipsRepo } from "../../workers/api/repositories/memberships-repo";
import { createOrganizationsRepo } from "../../workers/api/repositories/organizations-repo";
import { createUsersRepo } from "../../workers/api/repositories/users-repo";

export function testDb(): Db {
  return getDb(env);
}

export async function makeOrg(db: Db, id = "org_test_1") {
  return createOrganizationsRepo(db).ensure(id, "Test Org", "test-org");
}

export async function makeUser(db: Db, id = "user_test_1") {
  return createUsersRepo(db).ensure(id, {
    email: `${id}@example.com`,
    firstName: "Test",
    lastName: "User",
  });
}

export async function makeMembership(
  db: Db,
  orgId: string,
  userId: string,
  role = "inspector",
) {
  await createMembershipsRepo(db).ensureExists(orgId, userId, role);
}

export async function makeFacility(
  db: Db,
  orgId: string,
  overrides: Partial<{
    clientId: string;
    name: string;
    description: string | null;
    category: string | null;
    locationLat: number | null;
    locationLng: number | null;
    locationLabel: string | null;
  }> = {},
): Promise<Facility> {
  // A facility needs a client; create one if the caller didn't supply an id.
  const clientId =
    overrides.clientId ?? (await makeClient(db, orgId)).id;
  return createFacilitiesRepo(db).create({
    orgId,
    clientId,
    name: overrides.name ?? "First Facility",
    description: overrides.description ?? "A sample facility",
    category: overrides.category,
    locationLat: overrides.locationLat,
    locationLng: overrides.locationLng,
    locationLabel: overrides.locationLabel,
  });
}

export const defaultCheckpoints: CheckpointInput[] = [
  {
    prompt: "Condenser coils free of debris",
    answerType: "pass_fail",
    severity: "minor",
    critical: false,
    photoRequired: false,
  },
  {
    prompt: "Refrigerant pressure",
    answerType: "numeric",
    severity: "major",
    critical: false,
    photoRequired: false,
    config: { unit: "psi", okMin: 60, okMax: 80, warnMin: 50, warnMax: 90 },
  },
];

export async function makeForm(
  db: Db,
  orgId: string,
  overrides: Partial<{
    name: string;
    description: string | null;
    checkpoints: CheckpointInput[];
  }> = {},
): Promise<FormWithCheckpoints> {
  return createFormsRepo(db).create({
    orgId,
    name: overrides.name ?? "Quarterly HVAC Check",
    description: overrides.description ?? "Standard quarterly rubric",
    checkpoints: overrides.checkpoints ?? defaultCheckpoints,
  });
}

/** Create a draft inspection wired to a fresh facility, form, and inspector.
 * Returns the inspection plus the ids it references, so tests can drive the
 * observation/submit flow. */
export async function makeInspection(
  db: Db,
  orgId: string,
  opts: {
    inspectorUserId?: string;
    facilityId?: string;
    formId?: string;
    checkpoints?: CheckpointInput[];
    capturedLat?: number | null;
    capturedLng?: number | null;
  } = {},
): Promise<{
  inspection: InspectionWithObservations;
  facilityId: string;
  formId: string;
  form: FormWithCheckpoints;
  inspectorUserId: string;
}> {
  const inspectorUserId = opts.inspectorUserId ?? "user_test_1";
  await makeUser(db, inspectorUserId);
  const facilityId = opts.facilityId ?? (await makeFacility(db, orgId)).id;
  const form =
    opts.formId !== undefined
      ? (await createFormsRepo(db).getById(orgId, opts.formId))!
      : await makeForm(db, orgId, { checkpoints: opts.checkpoints });
  const inspection = await createInspectionsRepo(db).create({
    orgId,
    facilityId,
    formId: form.id,
    inspectorUserId,
    capturedLat: opts.capturedLat,
    capturedLng: opts.capturedLng,
  });
  return { inspection, facilityId, formId: form.id, form, inspectorUserId };
}

export async function makeClient(
  db: Db,
  orgId: string,
  overrides: Partial<{
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    notes: string | null;
  }> = {},
): Promise<Client> {
  return createClientsRepo(db).create({
    orgId,
    name: overrides.name ?? "Acme Properties",
    contactName: overrides.contactName,
    contactEmail: overrides.contactEmail,
    contactPhone: overrides.contactPhone,
    notes: overrides.notes,
  });
}

export async function makeEquipmentType(
  db: Db,
  orgId: string,
  overrides: Partial<{
    name: string;
    formIds: string[];
    description: string | null;
  }> = {},
): Promise<EquipmentType> {
  // A type needs at least one form; create one if the caller didn't supply ids.
  const formIds = overrides.formIds ?? [(await makeForm(db, orgId)).id];
  return createEquipmentTypesRepo(db).create({
    orgId,
    name: overrides.name ?? "Rooftop HVAC",
    formIds,
    description: overrides.description,
  });
}

export async function makeEquipment(
  db: Db,
  orgId: string,
  overrides: Partial<{
    facilityId: string;
    typeId: string;
    name: string;
    identifier: string | null;
  }> = {},
): Promise<Equipment> {
  const facilityId =
    overrides.facilityId ?? (await makeFacility(db, orgId)).id;
  const typeId = overrides.typeId ?? (await makeEquipmentType(db, orgId)).id;
  return createEquipmentRepo(db).create({
    orgId,
    facilityId,
    typeId,
    name: overrides.name ?? "Unit A-1",
    identifier: overrides.identifier,
  });
}
