import { describe, expect, it } from "vitest";
import { createFacilitiesRepo } from "../../workers/api/repositories/facilities-repo";
import { makeClient, makeFacility, makeOrg, testDb } from "../helpers/fixtures";

describe("facilities repo", () => {
  it("creates with a generated id, belonging to a client", async () => {
    const db = testDb();
    await makeOrg(db);
    const client = await makeClient(db, "org_test_1");
    const facility = await makeFacility(db, "org_test_1", {
      clientId: client.id,
      name: "Building A",
      category: "Warehouse",
    });

    expect(facility.id).toBeTruthy();
    expect(facility.clientId).toBe(client.id);
    expect(facility.name).toBe("Building A");
    expect(facility.category).toBe("Warehouse");
  });

  it("scopes getById by org", async () => {
    const db = testDb();
    const repo = createFacilitiesRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const facility = await makeFacility(db, "org_a");

    expect(await repo.getById("org_a", facility.id)).not.toBeNull();
    expect(await repo.getById("org_b", facility.id)).toBeNull();
  });

  it("lists per org with the client name joined, and counts", async () => {
    const db = testDb();
    const repo = createFacilitiesRepo(db);
    await makeOrg(db, "org_fl_a");
    await makeOrg(db, "org_fl_b");
    const client = await makeClient(db, "org_fl_a", { name: "Acme" });
    await makeFacility(db, "org_fl_a", { clientId: client.id, name: "One" });
    await makeFacility(db, "org_fl_a", { clientId: client.id, name: "Two" });
    await makeFacility(db, "org_fl_b", { name: "Other" });

    const list = await repo.listByOrg("org_fl_a");
    expect(list).toHaveLength(2);
    expect(list[0].clientName).toBe("Acme");
    expect(await repo.countByOrg("org_fl_a")).toBe(2);
    expect(await repo.countByOrg("org_fl_b")).toBe(1);
  });

  it("applies partial updates and leaves other fields intact", async () => {
    const db = testDb();
    const repo = createFacilitiesRepo(db);
    await makeOrg(db);
    const facility = await makeFacility(db, "org_test_1", {
      category: "Warehouse",
    });

    const updated = await repo.update("org_test_1", facility.id, {
      name: "Renamed",
    });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.category).toBe("Warehouse");
  });

  it("deletes scoped by org", async () => {
    const db = testDb();
    const repo = createFacilitiesRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const facility = await makeFacility(db, "org_a");

    expect(await repo.delete("org_b", facility.id)).toBe(false);
    expect(await repo.delete("org_a", facility.id)).toBe(true);
    expect(await repo.getById("org_a", facility.id)).toBeNull();
  });
});
