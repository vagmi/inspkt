import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createMembersController } from "../../workers/api/controllers/members-controller";
import { ValidationError } from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import { fakeMembership, mockMembersService } from "../helpers/mocks";

/** Mount the controller with the request's APP role (the authz authority). */
function makeApp(role: string, members = mockMembersService()) {
  const clerk = {
    organizations: {
      getOrganizationMembershipList: vi.fn().mockResolvedValue({ data: [] }),
      deleteOrganizationMembership: vi.fn(),
    },
  };

  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("clerk", clerk as never);
    c.set("orgId", "org_test_1");
    c.set("role", role as never);
    c.set("services", { members } as never);
    await next();
  });
  app.route("/members", createMembersController());
  return { app, members, clerk };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("members controller", () => {
  it("lists members of the active org (any member)", async () => {
    const { app, members } = makeApp("inspector");
    members.listMembers.mockResolvedValue([
      { userId: "user_a", role: "admin", email: "a@example.com" },
    ]);

    const res = await app.request("/members");
    expect(res.status).toBe(200);
    expect(members.listMembers).toHaveBeenCalledWith(
      "org_test_1",
      expect.any(Function),
    );
  });

  it("lets an admin change a member's role", async () => {
    const { app, members } = makeApp("admin");
    members.setMemberRole.mockResolvedValue(
      fakeMembership({ userId: "user_b", role: "manager" }),
    );

    const res = await app.request(
      "/members/user_b/role",
      json({ role: "manager" }, "PATCH"),
    );
    expect(res.status).toBe(200);
    expect(members.setMemberRole).toHaveBeenCalledWith(
      "org_test_1",
      "user_b",
      "manager",
    );
  });

  it("403s a manager trying to change a role (admins only)", async () => {
    const { app, members } = makeApp("manager");
    const res = await app.request(
      "/members/user_b/role",
      json({ role: "inspector" }, "PATCH"),
    );
    expect(res.status).toBe(403);
    expect(members.setMemberRole).not.toHaveBeenCalled();
  });

  it("400s an invalid role value", async () => {
    const { app, members } = makeApp("admin");
    const res = await app.request(
      "/members/user_b/role",
      json({ role: "superuser" }, "PATCH"),
    );
    expect(res.status).toBe(400);
    expect(members.setMemberRole).not.toHaveBeenCalled();
  });

  it("maps the last-admin guard to 422", async () => {
    const { app, members } = makeApp("admin");
    members.setMemberRole.mockRejectedValue(
      new ValidationError("an organization must keep at least one admin"),
    );

    const res = await app.request(
      "/members/user_b/role",
      json({ role: "inspector" }, "PATCH"),
    );
    expect(res.status).toBe(422);
  });

  it("lets an admin remove a member", async () => {
    const { app, members } = makeApp("admin");
    members.removeMember.mockResolvedValue(undefined);

    const res = await app.request("/members/user_b", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(members.removeMember).toHaveBeenCalledWith(
      "org_test_1",
      "user_b",
      expect.any(Function),
    );
  });

  it("403s an inspector trying to remove a member", async () => {
    const { app, members } = makeApp("inspector");
    const res = await app.request("/members/user_b", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(members.removeMember).not.toHaveBeenCalled();
  });
});
