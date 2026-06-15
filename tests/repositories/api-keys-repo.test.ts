import { describe, expect, it } from "vitest";
import { createApiKeysRepo } from "../../workers/api/repositories/api-keys-repo";
import { makeOrg, makeUser, testDb } from "../helpers/fixtures";

async function seed(orgId: string) {
  const db = testDb();
  await makeOrg(db, orgId);
  await makeUser(db, "user_test_1");
  return createApiKeysRepo(db);
}

describe("api keys repo", () => {
  it("creates a key and finds it by hash across orgs", async () => {
    const repo = await seed("org_key_a");
    const created = await repo.create({
      orgId: "org_key_a",
      name: "CI",
      tokenHash: "hash_abc",
      prefix: "inspkt_abcd1234",
      createdByUserId: "user_test_1",
    });
    expect(created.revokedAt).toBeNull();

    // findByHash is the auth lookup — by hash alone, not org-scoped.
    const found = await repo.findByHash("hash_abc");
    expect(found?.id).toBe(created.id);
    expect(found?.orgId).toBe("org_key_a");
    expect(await repo.findByHash("nope")).toBeNull();
  });

  it("lists and gets keys scoped by org", async () => {
    const repo = await seed("org_key_b");
    await makeOrg(testDb(), "org_key_c");
    const k = await repo.create({
      orgId: "org_key_b",
      name: "K",
      tokenHash: "h_b",
      prefix: "inspkt_b",
      createdByUserId: "user_test_1",
    });

    expect(await repo.listByOrg("org_key_b")).toHaveLength(1);
    expect(await repo.listByOrg("org_key_c")).toHaveLength(0);
    expect(await repo.getById("org_key_b", k.id)).not.toBeNull();
    // wrong org can't read it
    expect(await repo.getById("org_key_c", k.id)).toBeNull();
  });

  it("revokes scoped by org and stamps last-used", async () => {
    const repo = await seed("org_key_d");
    const k = await repo.create({
      orgId: "org_key_d",
      name: "K",
      tokenHash: "h_d",
      prefix: "inspkt_d",
      createdByUserId: "user_test_1",
    });

    // wrong org can't revoke
    expect(await repo.revoke("org_other", k.id)).toBe(false);
    expect(await repo.revoke("org_key_d", k.id)).toBe(true);
    expect((await repo.getById("org_key_d", k.id))?.revokedAt).toBeGreaterThan(0);

    await repo.touchLastUsed(k.id, 1_700_000_500);
    expect((await repo.findByHash("h_d"))?.lastUsedAt).toBe(1_700_000_500);
  });
});
