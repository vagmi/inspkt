import { describe, expect, it } from "vitest";
import { createEquipmentTypesRepo } from "../../workers/api/repositories/equipment-types-repo";
import { makeEquipmentType, makeForm, makeOrg, testDb } from "../helpers/fixtures";

describe("equipment types repo", () => {
  it("creates a type with several forms (many-to-many), joined in the list", async () => {
    const db = testDb();
    await makeOrg(db);
    const quarterly = await makeForm(db, "org_test_1", { name: "Quarterly" });
    const annual = await makeForm(db, "org_test_1", { name: "Annual" });
    const repo = createEquipmentTypesRepo(db);
    const type = await makeEquipmentType(db, "org_test_1", {
      formIds: [quarterly.id, annual.id],
      name: "Rooftop HVAC",
    });

    expect(type.forms.map((f) => f.name).sort()).toEqual([
      "Annual",
      "Quarterly",
    ]);

    const list = await repo.listByOrg("org_test_1");
    const row = list.find((t) => t.id === type.id);
    expect(row?.forms).toHaveLength(2);
  });

  it("persists a custom field schema", async () => {
    const db = testDb();
    const repo = createEquipmentTypesRepo(db);
    await makeOrg(db, "org_fields");
    const type = await repo.create({
      orgId: "org_fields",
      name: "Light Commercial Vehicle",
      formIds: [],
      fields: [
        { key: "license_plate", label: "License Plate", type: "text", required: true },
        {
          key: "body_style",
          label: "Body Style",
          type: "select",
          required: false,
          options: ["Van", "Truck"],
        },
      ],
    });
    expect(type.fields).toHaveLength(2);

    const loaded = await repo.getById("org_fields", type.id);
    expect(loaded?.fields[0]).toMatchObject({
      key: "license_plate",
      required: true,
    });
    expect(loaded?.fields[1].options).toEqual(["Van", "Truck"]);

    // updating the field schema replaces it
    const updated = await repo.update("org_fields", type.id, {
      fields: [{ key: "vin", label: "VIN", type: "text", required: true }],
    });
    expect(updated?.fields.map((f) => f.key)).toEqual(["vin"]);
  });

  it("can create a type with no forms, then attach one later", async () => {
    const db = testDb();
    const repo = createEquipmentTypesRepo(db);
    await makeOrg(db, "org_bare");
    const bare = await repo.create({
      orgId: "org_bare",
      name: "Uncategorized",
      formIds: [],
    });
    expect(bare.forms).toHaveLength(0);

    const form = await makeForm(db, "org_bare", { name: "Later" });
    const updated = await repo.update("org_bare", bare.id, {
      formIds: [form.id],
    });
    expect(updated?.forms.map((f) => f.name)).toEqual(["Later"]);
  });

  it("reconciles the form set on update", async () => {
    const db = testDb();
    const repo = createEquipmentTypesRepo(db);
    await makeOrg(db, "org_recon_t");
    const f1 = await makeForm(db, "org_recon_t", { name: "F1" });
    const f2 = await makeForm(db, "org_recon_t", { name: "F2" });
    const type = await makeEquipmentType(db, "org_recon_t", {
      formIds: [f1.id],
    });

    const updated = await repo.update("org_recon_t", type.id, {
      formIds: [f2.id],
    });
    expect(updated?.forms.map((f) => f.id)).toEqual([f2.id]);
  });

  it("scopes getById by org", async () => {
    const db = testDb();
    const repo = createEquipmentTypesRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const type = await makeEquipmentType(db, "org_a");

    expect(await repo.getById("org_a", type.id)).not.toBeNull();
    expect(await repo.getById("org_b", type.id)).toBeNull();
  });

  it("updates and deletes scoped by org", async () => {
    const db = testDb();
    const repo = createEquipmentTypesRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const type = await makeEquipmentType(db, "org_a");

    const updated = await repo.update("org_a", type.id, { name: "Renamed" });
    expect(updated?.name).toBe("Renamed");

    expect(await repo.delete("org_b", type.id)).toBe(false);
    expect(await repo.delete("org_a", type.id)).toBe(true);
    expect(await repo.getById("org_a", type.id)).toBeNull();
  });

  it("edits the join from the form side (typesForForm / setTypesForForm)", async () => {
    const db = testDb();
    const repo = createEquipmentTypesRepo(db);
    await makeOrg(db, "org_rev");
    const form = await makeForm(db, "org_rev", { name: "Quarterly" });
    // Two types, neither attached to the form yet.
    const hvac = await makeEquipmentType(db, "org_rev", {
      name: "HVAC",
      formIds: [],
    });
    const van = await makeEquipmentType(db, "org_rev", {
      name: "Van",
      formIds: [],
    });

    expect(await repo.typesForForm("org_rev", form.id)).toHaveLength(0);

    // Apply the form to both types from the form side.
    await repo.setTypesForForm("org_rev", form.id, [hvac.id, van.id]);
    const attached = await repo.typesForForm("org_rev", form.id);
    expect(attached.map((t) => t.name).sort()).toEqual(["HVAC", "Van"]);
    // The link is visible from the type side too.
    expect(
      (await repo.getById("org_rev", hvac.id))?.forms.map((f) => f.name),
    ).toEqual(["Quarterly"]);

    // Replace the set with just one type.
    await repo.setTypesForForm("org_rev", form.id, [van.id]);
    const after = await repo.typesForForm("org_rev", form.id);
    expect(after.map((t) => t.name)).toEqual(["Van"]);
    expect(
      (await repo.getById("org_rev", hvac.id))?.forms,
    ).toHaveLength(0);

    // typeLinksByForm exposes every link in the org for list grouping.
    const links = await repo.typeLinksByForm("org_rev");
    expect(links).toEqual([
      { formId: form.id, type: { id: van.id, name: "Van" } },
    ]);
  });
});
