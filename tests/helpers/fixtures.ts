import { env } from "cloudflare:test";
import { getDb, type Db } from "../../workers/api/db/client";
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
  createItemsRepo,
  type Item,
} from "../../workers/api/repositories/items-repo";
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
  role = "org:member",
) {
  await createMembershipsRepo(db).upsert(orgId, userId, role);
}

export async function makeItem(
  db: Db,
  orgId: string,
  overrides: Partial<{
    name: string;
    description: string | null;
    category: string | null;
    locationLat: number | null;
    locationLng: number | null;
    locationLabel: string | null;
  }> = {},
): Promise<Item> {
  return createItemsRepo(db).create({
    orgId,
    name: overrides.name ?? "First Item",
    description: overrides.description ?? "A sample item",
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

/** Create a draft inspection wired to a fresh item, form, and inspector.
 * Returns the inspection plus the ids it references, so tests can drive the
 * observation/submit flow. */
export async function makeInspection(
  db: Db,
  orgId: string,
  opts: {
    inspectorUserId?: string;
    itemId?: string;
    formId?: string;
    checkpoints?: CheckpointInput[];
    capturedLat?: number | null;
    capturedLng?: number | null;
  } = {},
): Promise<{
  inspection: InspectionWithObservations;
  itemId: string;
  formId: string;
  form: FormWithCheckpoints;
  inspectorUserId: string;
}> {
  const inspectorUserId = opts.inspectorUserId ?? "user_test_1";
  await makeUser(db, inspectorUserId);
  const itemId = opts.itemId ?? (await makeItem(db, orgId)).id;
  const form =
    opts.formId !== undefined
      ? (await createFormsRepo(db).getById(orgId, opts.formId))!
      : await makeForm(db, orgId, { checkpoints: opts.checkpoints });
  const inspection = await createInspectionsRepo(db).create({
    orgId,
    itemId,
    formId: form.id,
    inspectorUserId,
    capturedLat: opts.capturedLat,
    capturedLng: opts.capturedLng,
  });
  return { inspection, itemId, formId: form.id, form, inspectorUserId };
}
