import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { usageCounters } from "../db/schema";

export function createUsageRepo(db: Db) {
  return {
    /** Metered count for an org in a "YYYY-MM" period (0 if no row). */
    async getCount(orgId: string, period: string): Promise<number> {
      const [row] = await db
        .select({ count: usageCounters.count })
        .from(usageCounters)
        .where(
          and(eq(usageCounters.orgId, orgId), eq(usageCounters.period, period)),
        )
        .limit(1);
      return row?.count ?? 0;
    },

    /** Atomic upsert-increment — call this on each metered action. */
    async increment(orgId: string, period: string, by = 1): Promise<void> {
      await db
        .insert(usageCounters)
        .values({ orgId, period, count: by })
        .onConflictDoUpdate({
          target: [usageCounters.orgId, usageCounters.period],
          set: { count: sql`${usageCounters.count} + ${by}` },
        });
    },

    /** Recent monthly usage history, newest first (for the billing page). */
    async history(
      orgId: string,
      limit = 12,
    ): Promise<{ period: string; count: number }[]> {
      return db
        .select({
          period: usageCounters.period,
          count: usageCounters.count,
        })
        .from(usageCounters)
        .where(eq(usageCounters.orgId, orgId))
        .orderBy(desc(usageCounters.period))
        .limit(limit);
    },
  };
}

export type UsageRepo = ReturnType<typeof createUsageRepo>;
