import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organizations } from "./organizations";
import { now } from "./helpers";

/** Example resource. This is the copy-me template for your own data:
 * duplicate this file (e.g. `widgets.ts`), the repo, service, controller,
 * routes, and tests, then rename `item` -> your resource. Every row is
 * scoped to an org via `orgId`. */
export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("items_org_id_idx").on(t.orgId)],
);
