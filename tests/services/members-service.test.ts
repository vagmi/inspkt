import { describe, expect, it, vi } from "vitest";
import { createMembersService } from "../../workers/api/services/members-service";
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

describe("members service — ensureMembership", () => {
  it("skips the write when the mirror already matches the session role", async () => {
    const { service, membershipsRepo } = makeService();
    membershipsRepo.get.mockResolvedValue(fakeMembership({ role: "org:admin" }));

    await service.ensureMembership("org_test_1", "user_test_1", "org:admin");
    expect(membershipsRepo.upsert).not.toHaveBeenCalled();
  });

  it("upserts when the role changed (Clerk session is the source)", async () => {
    const { service, membershipsRepo } = makeService();
    membershipsRepo.get
      .mockResolvedValueOnce(fakeMembership({ role: "org:member" }))
      .mockResolvedValueOnce(fakeMembership({ role: "org:admin" }));

    await service.ensureMembership("org_test_1", "user_test_1", "org:admin");
    expect(membershipsRepo.upsert).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "org:admin",
    );
  });
});

describe("members service — listMembers", () => {
  it("reconciles users + memberships against Clerk, then returns the list", async () => {
    const { service, membershipsRepo, usersRepo } = makeService();
    const fetchAll = vi.fn().mockResolvedValue([
      {
        userId: "user_a",
        role: "org:admin",
        email: "a@example.com",
        firstName: "Ann",
      },
      { userId: "user_b", role: "org:member", email: "b@example.com" },
    ]);
    membershipsRepo.listByOrg.mockResolvedValue([{ userId: "user_a" }]);

    const members = await service.listMembers("org_test_1", fetchAll);

    expect(usersRepo.upsert).toHaveBeenCalledTimes(2);
    expect(membershipsRepo.reconcile).toHaveBeenCalledWith("org_test_1", [
      { userId: "user_a", role: "org:admin" },
      { userId: "user_b", role: "org:member" },
    ]);
    expect(members).toEqual([{ userId: "user_a" }]);
  });
});

describe("members service — removeMember", () => {
  it("removes in Clerk first, then prunes the mirror", async () => {
    const { service, membershipsRepo } = makeService();
    const order: string[] = [];
    const removeRemote = vi
      .fn()
      .mockImplementation(async () => void order.push("remote"));
    membershipsRepo.remove.mockImplementation(
      async () => void order.push("mirror"),
    );

    await service.removeMember("org_test_1", "user_b", removeRemote);
    expect(order).toEqual(["remote", "mirror"]);
    expect(membershipsRepo.remove).toHaveBeenCalledWith("org_test_1", "user_b");
  });
});

describe("members service — syncFromClerk", () => {
  it("upserts the user + role on membership created/updated", async () => {
    const { service, membershipsRepo, usersRepo } = makeService();
    await service.syncFromClerk({
      type: "organizationMembership.updated",
      data: {
        role: "org:admin",
        organization: { id: "org_test_1" },
        public_user_data: {
          user_id: "user_b",
          identifier: "b@example.com",
        },
      },
    });
    expect(usersRepo.upsert).toHaveBeenCalledWith("user_b", {
      email: "b@example.com",
      firstName: null,
      lastName: null,
      imageUrl: null,
    });
    expect(membershipsRepo.upsert).toHaveBeenCalledWith(
      "org_test_1",
      "user_b",
      "org:admin",
    );
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
