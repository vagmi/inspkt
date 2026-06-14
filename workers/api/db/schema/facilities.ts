import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { clients } from "./clients";
import { organizations } from "./organizations";
import { now } from "./helpers";

/** A facility: a physical site belonging to a client, against which
 * inspections are performed (equipment is registered here in Phase 8). Carries
 * a registered location so captured inspection locations can be compared.
 *
 * NOTE: the physical table is still named "items" (this resource started life
 * as the example `items` slice). Keeping the table name made the rename a safe,
 * additive migration — only `client_id` was added. The domain name everywhere
 * in code is "facility". */
export const facilities = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    /** The owning client. Nullable at the DB level only because existing rows
     * were backfilled; the app requires it on create (see validation). */
    clientId: text("client_id").references(() => clients.id),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    locationLat: real("location_lat"),
    locationLng: real("location_lng"),
    locationLabel: text("location_label"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("items_org_id_idx").on(t.orgId),
    index("facilities_client_id_idx").on(t.clientId),
  ],
);
