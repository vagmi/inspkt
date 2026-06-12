import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { organizations } from "./organizations";
import { now } from "./helpers";

/** The inspectable item registry: the physical things inspections are
 * performed against (an HVAC unit, a vehicle, a property unit, a site).
 * Carries a registered location so captured inspection locations can be
 * compared against it. Every row is scoped to an org via `orgId`. */
export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    locationLat: real("location_lat"),
    locationLng: real("location_lng"),
    locationLabel: text("location_label"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("items_org_id_idx").on(t.orgId)],
);
