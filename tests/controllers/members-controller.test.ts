import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createMembersController } from "../../workers/api/controllers/members-controller";
import type { ApiEnv } from "../../workers/api/types";
import { mockMembersService } from "../helpers/mocks";

interface StubAuth {
  has: (p: { role?: string; permission?: string }) => boolean;
}

function makeApp(auth: StubAuth, members = mockMembersService()) {
  const clerk = {
    organizations: {
      getOrganizationMembershipList: vi.fn().mockResolvedValue({ data: [] }),
      deleteOrganizationMembership: vi.fn(),
    },
  };

  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("clerkAuth", (() => auth) as never);
    c.set("clerk", clerk as never);
    c.set("orgId", "org_test_1");
    c.set("services", { members } as never);
    await next();
  });
  app.route("/members", createMembersController());
  return { app, members, clerk };
}

const admin: StubAuth = { has: ({ role }) => role === "org:admin" };
const member: StubAuth = { has: () => false };

describe("members controller", () => {
  it("lists members of the active org", async () => {
    const { app, members } = makeApp(admin);
    members.listMembers.mockResolvedValue([
      { userId: "user_a", role: "org:admin", email: "a@example.com" },
    ]);

    const res = await app.request("/members");
    expect(res.status).toBe(200);
    expect(members.listMembers).toHaveBeenCalledWith(
      "org_test_1",
      expect.any(Function),
    );
    const body = (await res.json()) as { members: unknown[] };
    expect(body.members).toHaveLength(1);
  });

  it("lets an admin remove a member", async () => {
    const { app, members } = makeApp(admin);
    members.removeMember.mockResolvedValue(undefined);

    const res = await app.request("/members/user_b", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(members.removeMember).toHaveBeenCalledWith(
      "org_test_1",
      "user_b",
      expect.any(Function),
    );
  });

  it("403s a non-admin trying to remove a member", async () => {
    const { app, members } = makeApp(member);
    const res = await app.request("/members/user_b", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(members.removeMember).not.toHaveBeenCalled();
  });
});
