import { describe, expect, it, vi } from "vitest";
import { createMembersService } from "../../workers/api/services/members-service";
import {
  NotFoundError,
  ValidationError,
} from "../../workers/api/services/errors";
import {
  fakeMembership,
  mockMembershipsRepo,
  mockUsersRepo,
} from "../helpers/mocks";

function makeService() {
  const membershipsRepo = mockMembershipsRepo();
  const usersRepo = mockUsersRepo();
  const service = createMembersService({ membershipsRepo, usersRepo });
  return { service, membershipsRepo, usersRepo };
}

describe("members service — ensureMembership (seed once)", () => {
  it("returns the existing row untouched — never re-seeds an app role", async () => {
    const { service, membershipsRepo } = makeService();
    membershipsRepo.get.mockResolvedValue(fakeMembership({ role: "manager" }));

    const m = await service.ensureMembership(
      "org_test_1",
      "user_test_1",
      "org:admin", // provider says admin, but our row says manager — keep manager
    );
    expect(m.role).toBe("manager");
    expect(membershipsRepo.ensureExists).not.toHaveBeenCalled();
  });

  it("seeds a new row from the provider role on first sight", async () => {
    const { service, membershipsRepo } = makeService();
    membershipsRepo.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fakeMembership({ role: "admin" }));

    await service.ensureMembership("org_test_1", "user_test_1", "org:admin");
    expect(membershipsRepo.ensureExists).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "admin", // org:admin → admin
    );
  });
});

describe("members service — setMemberRole", () => {
  it("sets the role and returns the updated row", async () => {
    const { service, membershipsRepo } = makeService();
    membershipsRepo.get
      .mockResolvedValueOnce(fakeMembership({ role: "inspector" }))
      .mockResolvedValueOnce(fakeMembership({ role: "manager" }));

    const m = await service.setMemberRole("org_test_1", "user_b", "manager");
    expect(membershipsRepo.setRole).toHaveBeenCalledWith(
      "org_test_1",
      "user_b",
      "manager",
    );
    expect(m.role).toBe("manager");
  });

  it("refuses to demote the last admin", async () => {
    const { service, membershipsRepo } = makeService();
    membershipsRepo.get.mockResolvedValue(fakeMembership({ role: "admin" }));
    membershipsRepo.countByRole.mockResolvedValue(1);

    await expect(
      service.setMemberRole("org_test_1", "user_b", "manager"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(membershipsRepo.setRole).not.toHaveBeenCalled();
  });

  it("allows demoting an admin when another admin remains", async () => {
    const { service, membershipsRepo } = makeService();
    membershipsRepo.get
      .mockResolvedValueOnce(fakeMembership({ role: "admin" }))
      .mockResolvedValueOnce(fakeMembership({ role: "manager" }));
    membershipsRepo.countByRole.mockResolvedValue(2);

    await expect(
      service.setMemberRole("org_test_1", "user_b", "manager"),
    ).resolves.toBeTruthy();
  });

  it("throws NotFound for an unknown member", async () => {
    const { service, membershipsRepo } = makeService();
    membershipsRepo.get.mockResolvedValue(null);
    await expect(
      service.setMemberRole("org_test_1", "ghost", "manager"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("members service — listMembers", () => {
  it("reconciles existence (not roles) and returns the joined list", async () => {
    const { service, membershipsRepo, usersRepo } = makeService();
    const fetchAll = vi.fn().mockResolvedValue([
      { userId: "user_a", role: "org:admin", email: "a@example.com" },
      { userId: "user_b", role: "org:member", email: "b@example.com" },
    ]);
    membershipsRepo.listByOrg.mockResolvedValue([
      { userId: "user_a", role: "manager" },
    ]);

    const members = await service.listMembers("org_test_1", fetchAll);

    expect(usersRepo.upsert).toHaveBeenCalledTimes(2);
    // reconcile by user id only, seeding new members as inspector — roles of
    // existing members are NOT pushed from the provider.
    expect(membershipsRepo.reconcile).toHaveBeenCalledWith(
      "org_test_1",
      ["user_a", "user_b"],
      "inspector",
    );
    expect(members).toEqual([{ userId: "user_a", role: "manager" }]);
  });
});

describe("members service — removeMember", () => {
  it("removes remotely first, then prunes the row", async () => {
    const { service, membershipsRepo } = makeService();
    membershipsRepo.get.mockResolvedValue(fakeMembership({ role: "inspector" }));
    const order: string[] = [];
    const removeRemote = vi
      .fn()
      .mockImplementation(async () => void order.push("remote"));
    membershipsRepo.remove.mockImplementation(
      async () => void order.push("local"),
    );

    await service.removeMember("org_test_1", "user_b", removeRemote);
    expect(order).toEqual(["remote", "local"]);
  });

  it("refuses to remove the last admin", async () => {
    const { service, membershipsRepo } = makeService();
    membershipsRepo.get.mockResolvedValue(fakeMembership({ role: "admin" }));
    membershipsRepo.countByRole.mockResolvedValue(1);
    const removeRemote = vi.fn();

    await expect(
      service.removeMember("org_test_1", "user_b", removeRemote),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(removeRemote).not.toHaveBeenCalled();
  });
});

describe("members service — syncFromClerk", () => {
  it("seeds the role only on first sight; never overwrites it on update", async () => {
    const { service, membershipsRepo, usersRepo } = makeService();
    await service.syncFromClerk({
      type: "organizationMembership.updated",
      data: {
        role: "org:admin",
        organization: { id: "org_test_1" },
        public_user_data: { user_id: "user_b", identifier: "b@example.com" },
      },
    });
    expect(usersRepo.upsert).toHaveBeenCalledWith("user_b", {
      email: "b@example.com",
      firstName: null,
      lastName: null,
      imageUrl: null,
    });
    // ensureExists seeds once (org:admin → admin) but won't clobber an existing
    // app role; setRole is never called from a webhook.
    expect(membershipsRepo.ensureExists).toHaveBeenCalledWith(
      "org_test_1",
      "user_b",
      "admin",
    );
    expect(membershipsRepo.setRole).not.toHaveBeenCalled();
  });

  it("removes the membership on deleted, ignores events without identity", async () => {
    const { service, membershipsRepo } = makeService();
    await service.syncFromClerk({
      type: "organizationMembership.deleted",
      data: {
        organization: { id: "org_test_1" },
        public_user_data: { user_id: "user_b" },
      },
    });
    expect(membershipsRepo.remove).toHaveBeenCalledWith("org_test_1", "user_b");

    membershipsRepo.remove.mockClear();
    await service.syncFromClerk({
      type: "organizationMembership.deleted",
      data: { organization: { id: "org_test_1" } },
    });
    expect(membershipsRepo.remove).not.toHaveBeenCalled();
  });
});
