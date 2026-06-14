import { describe, expect, it } from "vitest";
import { createFormsRepo } from "../../workers/api/repositories/forms-repo";
import { makeForm, makeOrg, testDb } from "../helpers/fixtures";

describe("forms repo", () => {
  it("creates a form with checkpoints positioned in array order", async () => {
    const db = testDb();
    await makeOrg(db);
    const form = await makeForm(db, "org_test_1");

    expect(form.id).toBeTruthy();
    expect(form.checkpoints).toHaveLength(2);
    expect(form.checkpoints[0].prompt).toBe("Condenser coils free of debris");
    expect(form.checkpoints[0].position).toBe(0);
    expect(form.checkpoints[1].position).toBe(1);
    expect(form.checkpoints[1].config).toEqual({
      unit: "psi",
      okMin: 60,
      okMax: 80,
      warnMin: 50,
      warnMax: 90,
    });
  });

  it("scopes getById by org", async () => {
    const db = testDb();
    const repo = createFormsRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const form = await makeForm(db, "org_a");

    expect(await repo.getById("org_a", form.id)).not.toBeNull();
    expect(await repo.getById("org_b", form.id)).toBeNull();
  });

  it("lists per org with checkpoint counts", async () => {
    const db = testDb();
    const repo = createFormsRepo(db);
    await makeOrg(db, "org_list_a");
    await makeOrg(db, "org_list_b");
    await makeForm(db, "org_list_a", { name: "A1" });
    await makeForm(db, "org_list_a", { name: "A2", checkpoints: [] });
    await makeForm(db, "org_list_b", { name: "B1" });

    const list = await repo.listByOrg("org_list_a");
    expect(list).toHaveLength(2);
    const byName = new Map(list.map((f) => [f.name, f.checkpointCount]));
    expect(byName.get("A1")).toBe(2);
    expect(byName.get("A2")).toBe(0);
  });

  it("reconciles checkpoints on update: keeps matched ids, drops missing, adds new", async () => {
    const db = testDb();
    const repo = createFormsRepo(db);
    await makeOrg(db);
    const form = await makeForm(db, "org_test_1");
    const [kept, dropped] = form.checkpoints;

    const updated = await repo.update("org_test_1", form.id, {
      checkpoints: [
        {
          prompt: "Filter replaced",
          answerType: "pass_fail",
          severity: "minor",
          critical: false,
          photoRequired: true,
        },
        {
          id: kept.id,
          prompt: "Coils spotless",
          answerType: "pass_fail",
          severity: "major",
          critical: true,
          photoRequired: false,
        },
      ],
    });

    expect(updated?.checkpoints).toHaveLength(2);
    const ids = updated!.checkpoints.map((c) => c.id);
    expect(ids).toContain(kept.id);
    expect(ids).not.toContain(dropped.id);
    // positions follow the new array order
    expect(updated!.checkpoints[0].prompt).toBe("Filter replaced");
    expect(updated!.checkpoints[1].id).toBe(kept.id);
    expect(updated!.checkpoints[1].prompt).toBe("Coils spotless");
    expect(updated!.checkpoints[1].critical).toBe(true);
  });

  it("deletes a form together with its checkpoints, scoped by org", async () => {
    const db = testDb();
    const repo = createFormsRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const form = await makeForm(db, "org_a");

    expect(await repo.delete("org_b", form.id)).toBe(false);
    expect(await repo.delete("org_a", form.id)).toBe(true);
    expect(await repo.getById("org_a", form.id)).toBeNull();
  });
});
