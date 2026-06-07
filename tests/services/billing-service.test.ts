import { describe, expect, it } from "vitest";
import { createBillingService } from "../../workers/api/services/billing-service";
import { ValidationError } from "../../workers/api/services/errors";
import {
  fakeOrg,
  mockItemsRepo,
  mockOrganizationsRepo,
  mockPolarAdapter,
  mockUsageRepo,
} from "../helpers/mocks";

const CONFIG = { proProductId: "prod_pro", bizProductId: "prod_biz" };

function makeService() {
  const polar = mockPolarAdapter();
  const orgsRepo = mockOrganizationsRepo();
  const usageRepo = mockUsageRepo();
  const itemsRepo = mockItemsRepo();
  const service = createBillingService({
    polar,
    orgsRepo,
    usageRepo,
    itemsRepo,
    config: CONFIG,
  });
  return { service, polar, orgsRepo, usageRepo, itemsRepo };
}

function subEvent(
  type: string,
  overrides: Partial<{
    status: string;
    productId: string;
    externalId: string | null;
    metadata: Record<string, unknown>;
  }> = {},
) {
  return {
    type,
    data: {
      id: "sub_1",
      status: overrides.status ?? "active",
      productId: overrides.productId ?? "prod_pro",
      customerId: "cus_1",
      currentPeriodEnd: "2026-07-06T00:00:00Z",
      customer: {
        externalId:
          "externalId" in overrides ? overrides.externalId : "org_test_1",
      },
      metadata: overrides.metadata ?? {},
    },
  };
}

describe("billing service — state", () => {
  it("composes plan, limits, usage and history", async () => {
    const { service, usageRepo, itemsRepo } = makeService();
    usageRepo.getCount.mockResolvedValue(42);
    usageRepo.history.mockResolvedValue([{ period: "2026-06", count: 42 }]);
    itemsRepo.countByOrg.mockResolvedValue(3);

    const state = await service.state(fakeOrg({ plan: "pro" }));
    expect(state.plan).toBe("pro");
    expect(state.limits.apiCallsPerMonth).toBe(5000);
    expect(state.usage.apiCalls).toBe(42);
    expect(state.usage.items).toBe(3);
  });
});

describe("billing service — checkout/portal", () => {
  it("maps plan to product and returns the checkout url", async () => {
    const { service, polar } = makeService();
    polar.createCheckout.mockResolvedValue("https://polar.sh/checkout/xyz");

    const url = await service.checkoutUrl(
      "org_test_1",
      "business",
      "https://app/billing",
    );
    expect(url).toBe("https://polar.sh/checkout/xyz");
    expect(polar.createCheckout).toHaveBeenCalledWith({
      productId: "prod_biz",
      orgId: "org_test_1",
      successUrl: "https://app/billing",
    });
  });

  it("rejects unknown plans", async () => {
    const { service } = makeService();
    await expect(
      service.checkoutUrl("org_test_1", "enterprise", "https://x"),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("billing service — reconcile", () => {
  it("applies the active subscription fetched from Polar", async () => {
    const { service, polar, orgsRepo } = makeService();
    polar.getActiveSubscription.mockResolvedValue({
      id: "sub_1",
      status: "active",
      productId: "prod_pro",
      customerId: "cus_1",
      currentPeriodEnd: new Date("2026-07-07T00:00:00Z"),
    });

    const applied = await service.reconcile("org_test_1");
    expect(applied).toBe(true);
    expect(orgsRepo.updateBilling).toHaveBeenCalledWith(
      "org_test_1",
      expect.objectContaining({
        plan: "pro",
        subscriptionStatus: "active",
        polarSubscriptionId: "sub_1",
      }),
    );
  });

  it("is a no-op without an active subscription", async () => {
    const { service, polar, orgsRepo } = makeService();
    polar.getActiveSubscription.mockResolvedValue(null);

    const applied = await service.reconcile("org_test_1");
    expect(applied).toBe(false);
    expect(orgsRepo.updateBilling).not.toHaveBeenCalled();
  });
});

describe("billing service — polar events", () => {
  it("activates the plan on subscription.active", async () => {
    const { service, orgsRepo } = makeService();
    await service.handlePolarEvent(subEvent("subscription.active"));

    expect(orgsRepo.updateBilling).toHaveBeenCalledWith(
      "org_test_1",
      expect.objectContaining({
        plan: "pro",
        subscriptionStatus: "active",
        polarSubscriptionId: "sub_1",
        polarCustomerId: "cus_1",
        currentPeriodEnd: expect.any(Number),
      }),
    );
  });

  it("maps the business product", async () => {
    const { service, orgsRepo } = makeService();
    await service.handlePolarEvent(
      subEvent("subscription.active", { productId: "prod_biz" }),
    );
    expect(orgsRepo.updateBilling).toHaveBeenCalledWith(
      "org_test_1",
      expect.objectContaining({ plan: "business" }),
    );
  });

  it("does not flip plan for unknown products or inactive status", async () => {
    const { service, orgsRepo } = makeService();

    await service.handlePolarEvent(
      subEvent("subscription.updated", { productId: "prod_other" }),
    );
    await service.handlePolarEvent(
      subEvent("subscription.created", { status: "incomplete" }),
    );

    for (const call of orgsRepo.updateBilling.mock.calls) {
      expect(call[1]).not.toHaveProperty("plan");
    }
  });

  it("keeps the plan on cancel, drops to free on revoke", async () => {
    const { service, orgsRepo } = makeService();

    await service.handlePolarEvent(
      subEvent("subscription.canceled", { status: "canceled" }),
    );
    expect(orgsRepo.updateBilling).toHaveBeenLastCalledWith(
      "org_test_1",
      expect.not.objectContaining({ plan: expect.anything() }),
    );

    await service.handlePolarEvent(
      subEvent("subscription.revoked", { status: "revoked" }),
    );
    expect(orgsRepo.updateBilling).toHaveBeenLastCalledWith(
      "org_test_1",
      expect.objectContaining({ plan: "free", polarSubscriptionId: null }),
    );
  });

  it("falls back to metadata.orgId and ignores events without identity", async () => {
    const { service, orgsRepo } = makeService();

    await service.handlePolarEvent(
      subEvent("subscription.active", {
        externalId: null,
        metadata: { orgId: "org_meta" },
      }),
    );
    expect(orgsRepo.updateBilling).toHaveBeenCalledWith(
      "org_meta",
      expect.anything(),
    );

    orgsRepo.updateBilling.mockClear();
    await service.handlePolarEvent(
      subEvent("subscription.active", { externalId: null, metadata: {} }),
    );
    expect(orgsRepo.updateBilling).not.toHaveBeenCalled();
  });

  it("ignores non-subscription events", async () => {
    const { service, orgsRepo } = makeService();
    await service.handlePolarEvent({
      type: "order.created",
      data: subEvent("x").data,
    });
    expect(orgsRepo.updateBilling).not.toHaveBeenCalled();
  });
});
