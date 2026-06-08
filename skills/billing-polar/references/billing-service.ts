// Copy to workers/api/services/billing-service.ts.
import { getPlan, type PlanId, type PlanLimits } from "~/lib/plans";
import { currentPeriod } from "~/lib/plans";
import type { PolarAdapter } from "../adapters/polar";
import type { ItemsRepo } from "../repositories/items-repo";
import type {
  Organization,
  OrganizationsRepo,
} from "../repositories/organizations-repo";
import type { UsageRepo } from "../repositories/usage-repo";
import { ValidationError } from "./errors";

export interface BillingConfig {
  proProductId: string;
  bizProductId: string;
}

export interface BillingState {
  plan: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: number | null;
  limits: PlanLimits;
  usage: { period: string; apiCalls: number; items: number };
  history: { period: string; count: number }[];
}

/** Structural view of Polar subscription.* webhook payloads — only the
 * fields we act on, so we're not coupled to the SDK's full union. */
export interface PolarSubscriptionEvent {
  type: string;
  data: {
    id: string;
    status: string;
    productId: string;
    customerId: string;
    currentPeriodEnd?: Date | string | null;
    customer?: { externalId?: string | null };
    metadata?: Record<string, unknown>;
  };
}

function toEpoch(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Math.floor(d.getTime() / 1000);
}

export function createBillingService(deps: {
  polar: PolarAdapter;
  orgsRepo: OrganizationsRepo;
  usageRepo: UsageRepo;
  itemsRepo: ItemsRepo;
  config: BillingConfig;
}) {
  const { config } = deps;

  function planForProduct(productId: string): PlanId | null {
    if (productId === config.proProductId) return "pro";
    if (productId === config.bizProductId) return "business";
    return null;
  }

  function productForPlan(plan: string): string | null {
    if (plan === "pro") return config.proProductId;
    if (plan === "business") return config.bizProductId;
    return null;
  }

  return {
    async state(org: Organization): Promise<BillingState> {
      const period = currentPeriod();
      const [apiCalls, items, history] = await Promise.all([
        deps.usageRepo.getCount(org.id, period),
        deps.itemsRepo.countByOrg(org.id),
        deps.usageRepo.history(org.id, 6),
      ]);
      return {
        plan: org.plan,
        subscriptionStatus: org.subscriptionStatus,
        currentPeriodEnd: org.currentPeriodEnd,
        limits: getPlan(org.plan),
        usage: { period, apiCalls, items },
        history,
      };
    },

    /** Checkout URL for upgrading to a paid plan. */
    async checkoutUrl(
      orgId: string,
      plan: string,
      successUrl: string,
    ): Promise<string> {
      const productId = productForPlan(plan);
      if (!productId) {
        throw new ValidationError(`unknown plan: ${plan}`);
      }
      return deps.polar.createCheckout({ productId, orgId, successUrl });
    },

    portalUrl(orgId: string): Promise<string> {
      return deps.polar.createPortalSession(orgId);
    },

    /**
     * Pull the org's active subscription straight from Polar and apply it.
     * Self-heals checkout returns when the webhook is delayed or missed
     * (common in local dev without a listener running).
     */
    async reconcile(orgId: string): Promise<boolean> {
      const sub = await deps.polar.getActiveSubscription(orgId);
      if (!sub) return false;

      const plan = planForProduct(sub.productId);
      await deps.orgsRepo.updateBilling(orgId, {
        polarCustomerId: sub.customerId,
        polarSubscriptionId: sub.id,
        subscriptionStatus: sub.status,
        currentPeriodEnd: toEpoch(sub.currentPeriodEnd),
        ...(plan && sub.status === "active" ? { plan } : {}),
      });
      return true;
    },

    /**
     * Single writer of organizations' billing fields. Resolves the org via
     * externalCustomerId (set at checkout) with metadata.orgId as fallback.
     */
    async handlePolarEvent(event: PolarSubscriptionEvent): Promise<void> {
      if (!event.type.startsWith("subscription.")) return;

      const orgId =
        event.data.customer?.externalId ??
        (typeof event.data.metadata?.orgId === "string"
          ? event.data.metadata.orgId
          : null);
      if (!orgId) {
        console.warn("polar event without org identity", event.type);
        return;
      }

      const base = {
        polarCustomerId: event.data.customerId,
        polarSubscriptionId: event.data.id,
        subscriptionStatus: event.data.status,
        currentPeriodEnd: toEpoch(event.data.currentPeriodEnd),
      };

      switch (event.type) {
        case "subscription.created":
        case "subscription.active":
        case "subscription.updated":
        case "subscription.uncanceled": {
          const plan = planForProduct(event.data.productId);
          await deps.orgsRepo.updateBilling(orgId, {
            ...base,
            // only flip the plan when the subscription is actually active
            // and we recognize the product
            ...(plan && event.data.status === "active" ? { plan } : {}),
          });
          break;
        }
        case "subscription.canceled":
          // remains on the paid plan until the period ends (revoked)
          await deps.orgsRepo.updateBilling(orgId, base);
          break;
        case "subscription.revoked":
          await deps.orgsRepo.updateBilling(orgId, {
            ...base,
            plan: "free",
            polarSubscriptionId: null,
          });
          break;
        default:
          break;
      }
    },
  };
}

export type BillingService = ReturnType<typeof createBillingService>;
