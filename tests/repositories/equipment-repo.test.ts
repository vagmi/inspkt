import { describe, expect, it } from "vitest";
import { createEquipmentRepo } from "../../workers/api/repositories/equipment-repo";
import {
  makeEquipment,
  makeEquipmentType,
  makeFacility,
  makeOrg,
  testDb,
} from "../helpers/fixtures";

describe("equipment repo", () => {
  it("creates and lists with facility + type names joined", async () => {
    const db = testDb();
    await makeOrg(db);
    const facility = await makeFacility(db, "org_test_1", { name: "Plant 1" });
    const type = await makeEquipmentType(db, "org_test_1", { name: "Chiller" });
    const item = await makeEquipment(db, "org_test_1", {
      facilityId: facility.id,
      typeId: type.id,
      name: "CH-01",
    });

    const repo = createEquipmentRepo(db);
    const list = await repo.listByOrg("org_test_1");
    const row = list.find((e) => e.id === item.id);
    expect(row?.name).toBe("CH-01");
    expect(row?.facilityName).toBe("Plant 1");
    expect(row?.typeName).toBe("Chiller");
  });

  it("filters by facility and counts by type", async () => {
    const db = testDb();
    const repo = createEquipmentRepo(db);
    await makeOrg(db, "org_eq");
    const fac1 = await makeFacility(db, "org_eq", { name: "F1" });
    const fac2 = await makeFacility(db, "org_eq", { name: "F2" });
    const type = await makeEquipmentType(db, "org_eq");
    await makeEquipment(db, "org_eq", { facilityId: fac1.id, typeId: type.id });
    await makeEquipment(db, "org_eq", { facilityId: fac1.id, typeId: type.id });
    await makeEquipment(db, "org_eq", { facilityId: fac2.id, typeId: type.id });

    expect(await repo.listByFacility("org_eq", fac1.id)).toHaveLength(2);
    expect(await repo.countByType("org_eq", type.id)).toBe(3);
  });

  it("scopes getById and delete by org", async () => {
    const db = testDb();
    const repo = createEquipmentRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const item = await makeEquipment(db, "org_a");

    expect(await repo.getById("org_b", item.id)).toBeNull();
    expect(await repo.delete("org_b", item.id)).toBe(false);
    expect(await repo.delete("org_a", item.id)).toBe(true);
  });
});
