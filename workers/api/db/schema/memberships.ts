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

/** A user's membership of an organization, with their role. One row per
 * (org, user). Membership existence follows the identity provider (Clerk org
 * membership); the `role` is APP-OWNED.
 *
 * `role` holds an app role — "admin" | "manager" | "inspector" (see
 * app/lib/capabilities.ts) — and IS the authorization authority. It's seeded
 * once from the provider at creation, then changed only by an admin in-app;
 * provider webhooks never overwrite it. */
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
