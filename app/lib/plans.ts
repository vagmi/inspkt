// Plan limits live in config, not the database: changing limits is a deploy,
// not a migration, and hot paths read zero extra rows. See docs/architecture.md.
//
// `maxFacilities` gates how many facilities an org can register (enforced in
// facilities-service). `maxInspectionsPerMonth` and `dataRetentionDays` are
// surfaced on the pricing page; wire their gates where inspections are created
// and pruned. Use `UNLIMITED` for any axis with no ceiling; `dataRetentionDays`
// is `null` when inspection history is kept forever.
//
// Out of the box every org is on "free" — the paid tiers below are config the
// gates already honor, but moving an org onto one needs a billing integration
// (install the `billing-polar` skill for Polar checkout/portal/webhooks).

export type PlanId = "free" | "pro" | "business";

/** Sentinel for an axis with no ceiling (`count >= UNLIMITED` is always false). */
export const UNLIMITED = Number.POSITIVE_INFINITY;

export interface PlanLimits {
  maxUsers: number;
  maxFacilities: number;
  maxInspectionsPerMonth: number;
  /** Days of inspection history retained; `null` means kept forever. */
  dataRetentionDays: number | null;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    maxUsers: 1,
    maxFacilities: 3,
    maxInspectionsPerMonth: 25,
    dataRetentionDays: 7,
  },
  pro: {
    maxUsers: 5,
    maxFacilities: 25,
    maxInspectionsPerMonth: 500,
    dataRetentionDays: null,
  },
  business: {
    maxUsers: 30,
    maxFacilities: UNLIMITED,
    maxInspectionsPerMonth: UNLIMITED,
    dataRetentionDays: null,
  },
};

export function getPlan(plan: string | null | undefined): PlanLimits {
  return PLANS[(plan as PlanId) ?? "free"] ?? PLANS.free;
}

/** Current usage period key, e.g. "2026-06". */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
