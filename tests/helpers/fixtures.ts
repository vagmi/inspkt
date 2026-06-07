import { env } from "cloudflare:test";
import { getDb, type Db } from "../../workers/api/db/client";
import {
  createItemsRepo,
  type Item,
} from "../../workers/api/repositories/items-repo";
import { createOrganizationsRepo } from "../../workers/api/repositories/organizations-repo";

export function testDb(): Db {
  return getDb(env);
}

export async function makeOrg(db: Db, id = "org_test_1") {
  return createOrganizationsRepo(db).ensure(id, "Test Org", "test-org");
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
