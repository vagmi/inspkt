import { describe, expect, it } from "vitest";
import { createInspectionsRepo } from "../../workers/api/repositories/inspections-repo";
import { makeInspection, makeOrg, testDb } from "../helpers/fixtures";

describe("inspections repo", () => {
  it("creates a draft inspection with captured location", async () => {
    const db = testDb();
    await makeOrg(db);
    const { inspection } = await makeInspection(db, "org_test_1", {
      capturedLat: 12.97,
      capturedLng: 77.59,
    });

    expect(inspection.id).toBeTruthy();
    expect(inspection.status).toBe("draft");
    expect(inspection.capturedLat).toBeCloseTo(12.97);
    expect(inspection.observations).toHaveLength(0);
  });

  it("scopes getById by org", async () => {
    const db = testDb();
    const repo = createInspectionsRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const { inspection } = await makeInspection(db, "org_a");

    expect(await repo.getById("org_a", inspection.id)).not.toBeNull();
    expect(await repo.getById("org_b", inspection.id)).toBeNull();
  });

  it("upserts observations keyed by checkpoint", async () => {
    const db = testDb();
    const repo = createInspectionsRepo(db);
    await makeOrg(db);
    const { inspection, form } = await makeInspection(db, "org_test_1");
    const [cp1, cp2] = form.checkpoints;

    // first save: answer cp1
    await repo.saveObservations("org_test_1", inspection.id, [
      {
        checkpointId: cp1.id,
        answer: { type: "pass_fail", pass: true },
        note: "looks good",
      },
    ]);
    let loaded = await repo.getById("org_test_1", inspection.id);
    expect(loaded?.observations).toHaveLength(1);

    // second save: re-answer cp1 (update, not duplicate) + add cp2
    await repo.saveObservations("org_test_1", inspection.id, [
      {
        checkpointId: cp1.id,
        answer: { type: "pass_fail", pass: false },
        photoKeys: ["org_test_1/abc.jpg"],
      },
      { checkpointId: cp2.id, answer: { type: "numeric", value: 70 } },
    ]);
    loaded = await repo.getById("org_test_1", inspection.id);
    expect(loaded?.observations).toHaveLength(2);
    const cp1Obs = loaded!.observations.find((o) => o.checkpointId === cp1.id);
    expect(cp1Obs?.answer).toEqual({ type: "pass_fail", pass: false });
    expect(cp1Obs?.photoKeys).toEqual(["org_test_1/abc.jpg"]);
  });

  it("marks an inspection submitted with a timestamp", async () => {
    const db = testDb();
    const repo = createInspectionsRepo(db);
    await makeOrg(db);
    const { inspection } = await makeInspection(db, "org_test_1");

    const submitted = await repo.markSubmitted("org_test_1", inspection.id);
    expect(submitted?.status).toBe("submitted");
    expect(submitted?.submittedAt).toBeGreaterThan(0);
  });

  it("lists per org with facility and form names", async () => {
    const db = testDb();
    const repo = createInspectionsRepo(db);
    await makeOrg(db, "org_insp_list_a");
    await makeOrg(db, "org_insp_list_b");
    await makeInspection(db, "org_insp_list_a");
    await makeInspection(db, "org_insp_list_b");

    const list = await repo.listByOrg("org_insp_list_a");
    expect(list).toHaveLength(1);
    expect(list[0].facilityName).toBe("First Facility");
    expect(list[0].formName).toBe("Quarterly HVAC Check");
  });

  it("deletes an inspection with its observations, scoped by org", async () => {
    const db = testDb();
    const repo = createInspectionsRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const { inspection, form } = await makeInspection(db, "org_a");
    await repo.saveObservations("org_a", inspection.id, [
      { checkpointId: form.checkpoints[0].id, answer: { type: "pass_fail", pass: true } },
    ]);

    expect(await repo.delete("org_b", inspection.id)).toBe(false);
    expect(await repo.delete("org_a", inspection.id)).toBe(true);
    expect(await repo.getById("org_a", inspection.id)).toBeNull();
  });
});
