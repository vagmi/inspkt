import { describe, expect, it } from "vitest";
import { createItemsRepo } from "../../workers/api/repositories/items-repo";
import { makeItem, makeOrg, testDb } from "../helpers/fixtures";

describe("items repo", () => {
  it("creates with a generated id", async () => {
    const db = testDb();
    await makeOrg(db);
    const item = await makeItem(db, "org_test_1");

    expect(item.id).toBeTruthy();
    expect(item.name).toBe("First Item");
    expect(item.description).toBe("A sample item");
  });

  it("scopes getById by org", async () => {
    const db = testDb();
    const repo = createItemsRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const item = await makeItem(db, "org_a");

    expect(await repo.getById("org_a", item.id)).not.toBeNull();
    expect(await repo.getById("org_b", item.id)).toBeNull();
  });

  it("lists and counts per org", async () => {
    const db = testDb();
    const repo = createItemsRepo(db);
    await makeOrg(db, "org_list_a");
    await makeOrg(db, "org_list_b");
    await makeItem(db, "org_list_a", { name: "One" });
    await makeItem(db, "org_list_a", { name: "Two" });
    await makeItem(db, "org_list_b", { name: "Other" });

    const list = await repo.listByOrg("org_list_a");
    expect(list).toHaveLength(2);
    expect(await repo.countByOrg("org_list_a")).toBe(2);
    expect(await repo.countByOrg("org_list_b")).toBe(1);
  });

  it("applies partial updates and leaves other fields intact", async () => {
    const db = testDb();
    const repo = createItemsRepo(db);
    await makeOrg(db);
    const item = await makeItem(db, "org_test_1");

    const updated = await repo.update("org_test_1", item.id, {
      name: "Renamed",
    });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.description).toBe("A sample item");
  });

  it("deletes scoped by org", async () => {
    const db = testDb();
    const repo = createItemsRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const item = await makeItem(db, "org_a");

    expect(await repo.delete("org_b", item.id)).toBe(false);
    expect(await repo.delete("org_a", item.id)).toBe(true);
    expect(await repo.getById("org_a", item.id)).toBeNull();
  });
});
