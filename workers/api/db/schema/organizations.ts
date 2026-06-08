import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { now } from "./helpers";

/** Local mirror of the Clerk organization.
 * `id` IS the Clerk org id — Clerk is the identity source of truth.
 *
 * `plan` drives the plan gates in app/lib/plans.ts; without a billing
 * integration every org stays on "free". The billing-polar skill adds the
 * subscription columns (polar_customer_id, subscription_status, …) and the
 * machinery to move an org off "free". */
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug"),
  plan: text("plan").notNull().default("free"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
});
