import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createBillingController } from "../../workers/api/controllers/billing-controller";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import type { ApiEnv } from "../../workers/api/types";
import { fakeOrg, mockBillingService } from "../helpers/mocks";

function makeApp(billing = mockBillingService()) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("org", fakeOrg());
    c.set("services", { billing } as never);
    await next();
  });
  app.route("/billing", createBillingController());
  return { app, billing };
}

describe("billing controller", () => {
  it("returns billing state", async () => {
    const { app, billing } = makeApp();
    billing.state.mockResolvedValue({ plan: "free" });

    const res = await app.request("/billing/state");
    expect(res.status).toBe(200);
    expect(billing.state).toHaveBeenCalledWith(
      expect.objectContaining({ id: "org_test_1" }),
    );
  });

  it("redirects checkout to Polar with the requested plan", async () => {
    const { app, billing } = makeApp();
    billing.checkoutUrl.mockResolvedValue("https://sandbox.polar.sh/c/xyz");

    const res = await app.request(
      "http://localhost/billing/checkout?plan=business",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://sandbox.polar.sh/c/xyz");
    expect(billing.checkoutUrl).toHaveBeenCalledWith(
      "org_test_1",
      "business",
      "http://localhost/app/billing?upgraded=1",
    );
  });

  it("reconciles on demand", async () => {
    const { app, billing } = makeApp();
    billing.reconcile.mockResolvedValue(true);

    const res = await app.request("/billing/reconcile", { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toEqual({ applied: true });
    expect(billing.reconcile).toHaveBeenCalledWith("org_test_1");
  });

  it("redirects to the customer portal", async () => {
    const { app, billing } = makeApp();
    billing.portalUrl.mockResolvedValue("https://sandbox.polar.sh/portal/abc");

    const res = await app.request("/billing/portal");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://sandbox.polar.sh/portal/abc",
    );
  });
});
