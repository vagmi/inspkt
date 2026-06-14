import { describe, expect, it } from "vitest";
import { createMembershipsRepo } from "../../workers/api/repositories/memberships-repo";
import { makeOrg, makeUser, testDb } from "../helpers/fixtures";

// The test DB persists across tests in this file, so each test uses its own
// org id to stay independent.
async function seed(orgId: string, ...userIds: string[]) {
  const db = testDb();
  await makeOrg(db, orgId);
  for (const u of userIds) await makeUser(db, u);
  return createMembershipsRepo(db);
}

describe("memberships repo", () => {
  it("ensureExists seeds a role once and never clobbers it", async () => {
    const repo = await seed("org_seed", "user_admin");
    await repo.ensureExists("org_seed", "user_admin", "admin");
    expect((await repo.get("org_seed", "user_admin"))?.role).toBe("admin");

    // a second ensureExists with a different seed must NOT change the role.
    await repo.ensureExists("org_seed", "user_admin", "inspector");
    expect((await repo.get("org_seed", "user_admin"))?.role).toBe("admin");
  });

  it("setRole updates an existing member's role", async () => {
    const repo = await seed("org_setrole", "user_admin");
    await repo.ensureExists("org_setrole", "user_admin", "inspector");
    await repo.setRole("org_setrole", "user_admin", "manager");
    expect((await repo.get("org_setrole", "user_admin"))?.role).toBe("manager");
  });

  it("countByRole counts members in a role, scoped by org", async () => {
    const repo = await seed("org_count", "user_admin", "user_member");
    await repo.ensureExists("org_count", "user_admin", "admin");
    await repo.ensureExists("org_count", "user_member", "inspector");
    expect(await repo.countByRole("org_count", "admin")).toBe(1);
    expect(await repo.countByRole("org_count", "inspector")).toBe(1);
    expect(await repo.countByRole("org_count", "manager")).toBe(0);
  });

  it("lists members with their profile joined", async () => {
    const repo = await seed("org_list", "user_admin", "user_member");
    await repo.ensureExists("org_list", "user_admin", "admin");
    await repo.ensureExists("org_list", "user_member", "inspector");

    const members = await repo.listByOrg("org_list");
    expect(members).toHaveLength(2);
    const admin = members.find((m) => m.userId === "user_admin");
    expect(admin?.role).toBe("admin");
    expect(admin?.email).toBe("user_admin@example.com");
  });

  it("reconcile adds missing, drops absent, and PRESERVES existing roles", async () => {
    const repo = await seed(
      "org_recon",
      "user_admin",
      "user_member",
      "user_new",
    );
    await repo.ensureExists("org_recon", "user_admin", "admin");
    await repo.ensureExists("org_recon", "user_member", "inspector");

    // Provider now reports user_admin + user_new (user_member left).
    await repo.reconcile("org_recon", ["user_admin", "user_new"], "inspector");

    const members = await repo.listByOrg("org_recon");
    expect(members.map((m) => m.userId).sort()).toEqual([
      "user_admin",
      "user_new",
    ]);
    // user_admin keeps its app role; the new member is seeded inspector.
    expect(members.find((m) => m.userId === "user_admin")?.role).toBe("admin");
    expect(members.find((m) => m.userId === "user_new")?.role).toBe(
      "inspector",
    );
  });

  it("remove deletes a single membership", async () => {
    const repo = await seed("org_remove", "user_admin", "user_member");
    await repo.ensureExists("org_remove", "user_admin", "admin");
    await repo.ensureExists("org_remove", "user_member", "inspector");

    await repo.remove("org_remove", "user_member");
    const members = await repo.listByOrg("org_remove");
    expect(members.map((m) => m.userId)).toEqual(["user_admin"]);
  });

  it("scopes by org — never leaks another org's members", async () => {
    const repo = await seed("org_scope_a", "user_admin");
    await makeOrg(testDb(), "org_scope_b");
    await repo.ensureExists("org_scope_a", "user_admin", "admin");
    await repo.ensureExists("org_scope_b", "user_admin", "admin");

    expect(await repo.listByOrg("org_scope_a")).toHaveLength(1);
    await repo.remove("org_scope_a", "user_admin");
    expect(await repo.listByOrg("org_scope_b")).toHaveLength(1);
  });
});
