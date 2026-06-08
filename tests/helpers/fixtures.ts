import { env } from "cloudflare:test";
import { getDb, type Db } from "../../workers/api/db/client";
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
  overrides: Partial<{ name: string; description: string | null }> = {},
): Promise<Item> {
  return createItemsRepo(db).create({
    orgId,
    name: overrides.name ?? "First Item",
    description: overrides.description ?? "A sample item",
  });
}
