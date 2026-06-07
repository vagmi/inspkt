import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { describe, expect, it, vi } from "vitest";
import { requireOrg } from "../../workers/api/middleware/auth";
import type { ApiEnv } from "../../workers/api/types";
import { fakeOrg } from "../helpers/mocks";

interface StubAuth {
  userId?: string | null;
  orgId?: string | null;
}

/** Mimics what @clerk/hono's clerkMiddleware sets on the context. */
function stubClerk(auth: StubAuth | null, getOrganization = vi.fn()) {
  return createMiddleware(async (c, next) => {
    c.set("clerkAuth", (() => auth) as never);
    c.set("clerk", { organizations: { getOrganization } } as never);
    await next();
  });
}

function makeApp(
  auth: StubAuth | null,
  ensureOrg = vi.fn().mockResolvedValue(fakeOrg()),
  getOrganization = vi.fn(),
) {
  const app = new Hono<ApiEnv>();
  app.use(stubClerk(auth, getOrganization));
  app.use(async (c, next) => {
    c.set("services", {
      organizations: { ensureOrg, getById: vi.fn() },
    } as never);
    await next();
  });
  app.use(requireOrg);
  app.get("/probe", (c) => c.json({ orgId: c.var.orgId, org: c.var.org }));
  return { app, ensureOrg };
}

describe("requireOrg middleware", () => {
  it("401s without a signed-in user", async () => {
    const { app } = makeApp(null);
    const res = await app.request("/probe");
    expect(res.status).toBe(401);
  });

  it("403s when signed in but no active organization", async () => {
    const { app } = makeApp({ userId: "user_1", orgId: null });
    const res = await app.request("/probe");
    expect(res.status).toBe(403);
  });

  it("sets orgId and org, ensuring the mirror row", async () => {
    const org = fakeOrg({ id: "org_42", name: "Org 42" });
    const ensureOrg = vi.fn().mockResolvedValue(org);
    const { app } = makeApp({ userId: "user_1", orgId: "org_42" }, ensureOrg);

    const res = await app.request("/probe");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orgId: string; org: { name: string } };
    expect(body.orgId).toBe("org_42");
    expect(body.org.name).toBe("Org 42");
    expect(ensureOrg).toHaveBeenCalledWith("org_42", expect.any(Function));
  });

  it("fetches org details from Clerk only via the lazy callback", async () => {
    const getOrganization = vi
      .fn()
      .mockResolvedValue({ name: "Fetched", slug: "fetched" });
    // ensureOrg invokes the callback (simulating a missing mirror row)
    const ensureOrg = vi
      .fn()
      .mockImplementation(
        async (
          _orgId: string,
          fetchDetails: () => Promise<{ name: string }>,
        ) => {
          const details = await fetchDetails();
          return fakeOrg({ id: "org_42", name: details.name });
        },
      );
    const { app } = makeApp(
      { userId: "user_1", orgId: "org_42" },
      ensureOrg,
      getOrganization,
    );

    const res = await app.request("/probe");
    expect(res.status).toBe(200);
    expect(getOrganization).toHaveBeenCalledWith({
      organizationId: "org_42",
    });
  });
});
