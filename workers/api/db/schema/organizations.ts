import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { now } from "./helpers";

/** Local mirror of the Clerk organization + billing state.
 * `id` IS the Clerk org id — Clerk is the identity source of truth. */
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug"),
  plan: text("plan").notNull().default("free"),
  polarCustomerId: text("polar_customer_id"),
  polarSubscriptionId: text("polar_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  currentPeriodEnd: integer("current_period_end"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
});
