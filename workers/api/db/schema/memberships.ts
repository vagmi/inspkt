import {
  integer,
  index,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { now } from "./helpers";
import { organizations } from "./organizations";
import { users } from "./users";

/** A user's membership of an organization, with their role — the local mirror
 * of Clerk's User ↔ Organization link. One row per (org, user).
 *
 * `role` is the Clerk role string (e.g. "org:admin", "org:member"). It is a
 * mirror for display/data only and can lag a webhook — DO NOT gate on it.
 * Authorize from the Clerk session instead (see app/lib/capabilities.ts). */
export const memberships = sqliteTable(
  "memberships",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    index("memberships_user_id_idx").on(t.userId),
  ],
);
