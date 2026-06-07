import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/** Per-org, per-month usage counter. Atomic upsert-increment on each metered
 * action; one row read per limit check; doubles as usage history.
 *
 * `count` is intentionally generic — it can track API calls, item creations,
 * or whatever metered action your app gates on. See app/lib/plans.ts. */
export const usageCounters = sqliteTable(
  "usage_counters",
  {
    orgId: text("org_id").notNull(),
    /** "YYYY-MM" */
    period: text("period").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.period] })],
);
