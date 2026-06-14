import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organizations } from "./organizations";
import { now } from "./helpers";

/** A client: a customer the organization performs inspections for. Facilities
 * (Phase 7) belong to a client. Every row is scoped to an org via `orgId`. */
export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("clients_org_id_idx").on(t.orgId)],
);
