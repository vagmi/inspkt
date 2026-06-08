// Plan limits live in config, not the database: changing limits is a deploy,
// not a migration, and hot paths read zero extra rows. See docs/architecture.md.
//
// `maxItems` gates the example `items` resource; `apiCallsPerMonth` is the
// metered usage example (see workers/api/db/schema/usage-counters.ts). Rename
// or add fields here as you build your own app — every gate reads from PLANS.
//
// Out of the box every org is on "free" — the paid tiers below are config the
// gates already honor, but moving an org onto one needs a billing integration
// (install the `billing-polar` skill for Polar checkout/portal/webhooks).

export type PlanId = "free" | "pro" | "business";

export interface PlanLimits {
  maxItems: number;
  apiCallsPerMonth: number;
  webhooks: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { maxItems: 3, apiCallsPerMonth: 100, webhooks: false },
  pro: { maxItems: 25, apiCallsPerMonth: 5_000, webhooks: true },
  business: { maxItems: 999, apiCallsPerMonth: 50_000, webhooks: true },
};

export function getPlan(plan: string | null | undefined): PlanLimits {
  return PLANS[(plan as PlanId) ?? "free"] ?? PLANS.free;
}

/** Current usage period key, e.g. "2026-06". */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
