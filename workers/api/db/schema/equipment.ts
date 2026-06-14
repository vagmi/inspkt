import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { facilities } from "./facilities";
import { forms } from "./forms";
import { now } from "./helpers";
import { organizations } from "./organizations";

/** An equipment type: the org's taxonomy of inspectable assets (e.g. "Rooftop
 * HVAC", "Delivery Van"). A type has one or more inspection **forms** (its
 * rubrics) via the `equipment_type_forms` join — so an inspection on a piece of
 * equipment chooses among its type's forms (Phase 9). */
export const equipmentTypes = sqliteTable(
  "equipment_types",
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
  (t) => [index("equipment_types_org_id_idx").on(t.orgId)],
);

/** Many-to-many: a type can have several forms, a form can apply to several
 * types. */
export const equipmentTypeForms = sqliteTable(
  "equipment_type_forms",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    typeId: text("type_id")
      .notNull()
      .references(() => equipmentTypes.id),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id),
  },
  (t) => [
    primaryKey({ columns: [t.typeId, t.formId] }),
    index("equipment_type_forms_org_id_idx").on(t.orgId),
    index("equipment_type_forms_form_id_idx").on(t.formId),
  ],
);

/** A piece of equipment: the actual inspectable asset, of a given type, sitting
 * at a facility. Carries an optional own location (falls back to the
 * facility's when comparing against a captured inspection location). */
export const equipment = sqliteTable(
  "equipment",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    facilityId: text("facility_id")
      .notNull()
      .references(() => facilities.id),
    typeId: text("type_id")
      .notNull()
      .references(() => equipmentTypes.id),
    name: text("name").notNull(),
    /** Optional asset tag / serial number. */
    identifier: text("identifier"),
    locationLat: real("location_lat"),
    locationLng: real("location_lng"),
    locationLabel: text("location_label"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("equipment_org_id_idx").on(t.orgId),
    index("equipment_facility_id_idx").on(t.facilityId),
    index("equipment_type_id_idx").on(t.typeId),
  ],
);
