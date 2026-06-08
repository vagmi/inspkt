import { describe, expect, it } from "vitest";
import { createMembershipsRepo } from "../../workers/api/repositories/memberships-repo";
import { makeOrg, makeUser, testDb } from "../helpers/fixtures";

async function seed(db = testDb()) {
  await makeOrg(db, "org_m");
  await makeUser(db, "user_admin");
  await makeUser(db, "user_member");
  return createMembershipsRepo(db);
}

describe("memberships repo", () => {
  it("upserts a membership and reads its role back", async () => {
    const repo = await seed();
    await repo.upsert("org_m", "user_admin", "org:admin");

    const m = await repo.get("org_m", "user_admin");
    expect(m?.role).toBe("org:admin");

    // upsert again with a new role updates in place.
    await repo.upsert("org_m", "user_admin", "org:member");
    expect((await repo.get("org_m", "user_admin"))?.role).toBe("org:member");
  });

  it("lists members with their profile joined", async () => {
    const repo = await seed();
    await repo.upsert("org_m", "user_admin", "org:admin");
    await repo.upsert("org_m", "user_member", "org:member");

    const members = await repo.listByOrg("org_m");
    expect(members).toHaveLength(2);
    const admin = members.find((m) => m.userId === "user_admin");
    expect(admin?.role).toBe("org:admin");
    expect(admin?.email).toBe("user_admin@example.com");
  });

  it("reconcile upserts present rows and drops missing ones", async () => {
    const repo = await seed();
    await repo.upsert("org_m", "user_admin", "org:admin");
    await repo.upsert("org_m", "user_member", "org:member");

    // user_member is gone from Clerk; user_admin demoted.
    await repo.reconcile("org_m", [{ userId: "user_admin", role: "org:member" }]);

    const members = await repo.listByOrg("org_m");
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe("user_admin");
    expect(members[0].role).toBe("org:member");
  });

  it("remove deletes a single membership", async () => {
    const repo = await seed();
    await repo.upsert("org_m", "user_admin", "org:admin");
    await repo.upsert("org_m", "user_member", "org:member");

    await repo.remove("org_m", "user_member");
    const members = await repo.listByOrg("org_m");
    expect(members.map((m) => m.userId)).toEqual(["user_admin"]);
  });

  it("scopes by org — never leaks another org's members", async () => {
    const db = testDb();
    const repo = await seed(db);
    await makeOrg(db, "org_other");
    await repo.upsert("org_m", "user_admin", "org:admin");
    await repo.upsert("org_other", "user_admin", "org:admin");

    expect(await repo.listByOrg("org_m")).toHaveLength(1);
    await repo.remove("org_m", "user_admin");
    // the other org's membership is untouched.
    expect(await repo.listByOrg("org_other")).toHaveLength(1);
  });
});
