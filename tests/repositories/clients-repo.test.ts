import { describe, expect, it } from "vitest";
import { createClientsRepo } from "../../workers/api/repositories/clients-repo";
import { makeClient, makeOrg, testDb } from "../helpers/fixtures";

describe("clients repo", () => {
  it("creates with a generated id and contact fields", async () => {
    const db = testDb();
    await makeOrg(db);
    const client = await makeClient(db, "org_test_1", {
      contactName: "Dana",
      contactEmail: "dana@acme.example",
    });

    expect(client.id).toBeTruthy();
    expect(client.name).toBe("Acme Properties");
    expect(client.contactName).toBe("Dana");
    expect(client.contactEmail).toBe("dana@acme.example");
    expect(client.contactPhone).toBeNull();
  });

  it("scopes getById by org", async () => {
    const db = testDb();
    const repo = createClientsRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const client = await makeClient(db, "org_a");

    expect(await repo.getById("org_a", client.id)).not.toBeNull();
    expect(await repo.getById("org_b", client.id)).toBeNull();
  });

  it("lists and counts per org", async () => {
    const db = testDb();
    const repo = createClientsRepo(db);
    await makeOrg(db, "org_cl_a");
    await makeOrg(db, "org_cl_b");
    await makeClient(db, "org_cl_a", { name: "One" });
    await makeClient(db, "org_cl_a", { name: "Two" });
    await makeClient(db, "org_cl_b", { name: "Other" });

    expect(await repo.listByOrg("org_cl_a")).toHaveLength(2);
    expect(await repo.countByOrg("org_cl_a")).toBe(2);
    expect(await repo.countByOrg("org_cl_b")).toBe(1);
  });

  it("applies partial updates and leaves other fields intact", async () => {
    const db = testDb();
    const repo = createClientsRepo(db);
    await makeOrg(db);
    const client = await makeClient(db, "org_test_1", { contactName: "Dana" });

    const updated = await repo.update("org_test_1", client.id, {
      name: "Acme Renamed",
    });
    expect(updated?.name).toBe("Acme Renamed");
    expect(updated?.contactName).toBe("Dana");
  });

  it("deletes scoped by org", async () => {
    const db = testDb();
    const repo = createClientsRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const client = await makeClient(db, "org_a");

    expect(await repo.delete("org_b", client.id)).toBe(false);
    expect(await repo.delete("org_a", client.id)).toBe(true);
    expect(await repo.getById("org_a", client.id)).toBeNull();
  });
});
