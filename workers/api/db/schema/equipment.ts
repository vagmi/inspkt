import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { clients } from "./clients";
import { facilities } from "./facilities";
import { forms } from "./forms";
import { now } from "./helpers";
import { organizations } from "./organizations";

/** The data type of a custom field an equipment type tracks. */
export type FieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "multiselect"
  | "file";

/** One custom field in an equipment type's metadata schema. Equipment of the
 * type stores a value per `key` in its `metadata`. */
export interface FieldDef {
  /** Machine key, unique within the type (e.g. "license_plate"). */
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Choices for `select` / `multiselect`. */
  options?: string[];
  helpText?: string;
}

/** An equipment type: the org's taxonomy of inspectable assets (e.g. "Rooftop
 * HVAC", "Light Commercial Vehicle"). A type has one or more inspection
 * **forms** (its rubrics) via the `equipment_type_forms` join, and a **field
 * schema** (`fields`) describing the metadata its equipment must track. */
export const equipmentTypes = sqliteTable(
  "equipment_types",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    /** The custom-field schema for equipment of this type. */
    fields: text("fields", { mode: "json" })
      .$type<FieldDef[]>()
      .notNull()
      .default([]),
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

/** A piece of equipment: the actual inspectable asset, of a given type.
 * Usually sits at a facility, but a mobile asset (service truck, van) may have
 * none — `facilityId` is optional. Carries an optional own location (falls back
 * to the facility's, when it has one, for inspection location comparison). */
export const equipment = sqliteTable(
  "equipment",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    /** The owning client. Nullable at the DB level only (added by migration);
     * the app requires it on create. Someone always owns the equipment. */
    clientId: text("client_id").references(() => clients.id),
    /** Optional — mobile equipment (van, truck) isn't tied to a facility. When
     * set, the facility must belong to the same client. */
    facilityId: text("facility_id").references(() => facilities.id),
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
    index("equipment_client_id_idx").on(t.clientId),
    index("equipment_facility_id_idx").on(t.facilityId),
    index("equipment_type_id_idx").on(t.typeId),
  ],
);
