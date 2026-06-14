import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { describe, expect, it, vi } from "vitest";
import { can } from "../../app/lib/capabilities";
import {
  requireCapability,
  requireOrg,
} from "../../workers/api/middleware/auth";
import type { ApiEnv } from "../../workers/api/types";
import { fakeMembership, fakeOrg, fakeUser } from "../helpers/mocks";

interface StubAuth {
  userId?: string | null;
  orgId?: string | null;
  orgRole?: string | null;
}

/** Mimics what @clerk/hono's clerkMiddleware sets on the context. */
function stubClerk(auth: StubAuth | null) {
  return createMiddleware(async (c, next) => {
    c.set("clerkAuth", (() => auth) as never);
    c.set("clerk", {
      organizations: { getOrganization: vi.fn() },
      users: {
        getUser: vi
          .fn()
          .mockResolvedValue({ emailAddresses: [], firstName: null }),
      },
    } as never);
    await next();
  });
}

function makeApp(auth: StubAuth | null, membershipRole = "admin") {
  const ensureOrg = vi.fn().mockResolvedValue(fakeOrg());
  const ensureUser = vi.fn().mockResolvedValue(fakeUser());
  const ensureMembership = vi
    .fn()
    .mockResolvedValue(fakeMembership({ role: membershipRole }));

  const app = new Hono<ApiEnv>();
  app.use(stubClerk(auth));
  app.use(async (c, next) => {
    c.set("services", {
      organizations: { ensureOrg, getById: vi.fn() },
      users: { ensureUser },
      members: { ensureMembership },
    } as never);
    await next();
  });
  app.use(requireOrg);
  app.get("/probe", (c) =>
    c.json({
      orgId: c.var.orgId,
      userId: c.var.userId,
      role: c.var.role,
      membershipRole: c.var.membership.role,
    }),
  );
  return { app, ensureOrg, ensureUser, ensureMembership };
}

describe("requireOrg middleware", () => {
  it("401s without a signed-in user", async () => {
    const { app } = makeApp(null);
    expect((await app.request("/probe")).status).toBe(401);
  });

  it("403s when signed in but no active organization", async () => {
    const { app } = makeApp({ userId: "user_1", orgId: null });
    expect((await app.request("/probe")).status).toBe(403);
  });

  it("exposes the APP role from our membership and seeds with the provider role", async () => {
    const { app, ensureUser, ensureMembership } = makeApp(
      { userId: "user_1", orgId: "org_42", orgRole: "org:admin" },
      "manager", // our DB says manager — that's what authz uses
    );

    const res = await app.request("/probe");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orgId: string; role: string };
    expect(body.orgId).toBe("org_42");
    expect(body.role).toBe("manager"); // app role, not the provider's org:admin
    expect(ensureUser).toHaveBeenCalledWith("user_1", expect.any(Function));
    // ensureMembership is seeded with the PROVIDER role (org:admin), used only
    // if the row doesn't exist yet.
    expect(ensureMembership).toHaveBeenCalledWith(
      "org_42",
      "user_1",
      "org:admin",
    );
  });
});

describe("requireCapability middleware", () => {
  /** Set the app role directly (as requireOrg would) and gate. */
  function gatedApp(role: string | null) {
    const app = new Hono<ApiEnv>();
    app.use(async (c, next) => {
      if (role) c.set("role", role as never);
      await next();
    });
    app.use(requireCapability(can.removeMember));
    app.get("/admin-only", (c) => c.json({ ok: true }));
    return app;
  }

  it("allows an admin (role read from our DB)", async () => {
    expect((await gatedApp("admin").request("/admin-only")).status).toBe(200);
  });

  it("403s a non-admin", async () => {
    expect((await gatedApp("manager").request("/admin-only")).status).toBe(403);
    expect((await gatedApp(null).request("/admin-only")).status).toBe(403);
  });
});
