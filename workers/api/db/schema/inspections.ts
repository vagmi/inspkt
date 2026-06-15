import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { equipment } from "./equipment";
import { facilities } from "./facilities";
import { checkpoints, forms } from "./forms";
import { now } from "./helpers";
import { organizations } from "./organizations";
import { users } from "./users";

/** An inspection: one inspector working a form against a piece of equipment.
 * Starts as a draft (resumable) and finalizes on submit. Verdict/score/
 * re-inspection fields are added in Phase 11 — submit here only flips the
 * status. Captured lat/lng record where the inspection was actually performed,
 * so it can be compared against the equipment's (or its facility's) registered
 * location.
 *
 * Phase 9 retargeted this from a bare facility to Equipment. `equipmentId` is
 * the target (nullable in the DB only — the app always sets it). `facilityId`
 * is a denormalized snapshot of the equipment's facility at capture time (null
 * for mobile equipment); it stays physically named `item_id` from the original
 * `items` model. */
export const inspections = sqliteTable(
  "inspections",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    equipmentId: text("equipment_id").references(() => equipment.id),
    facilityId: text("item_id").references(() => facilities.id),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id),
    inspectorUserId: text("inspector_user_id")
      .notNull()
      .references(() => users.id),
    status: text("status", { enum: ["draft", "submitted"] })
      .notNull()
      .default("draft"),
    capturedLat: real("captured_lat"),
    capturedLng: real("captured_lng"),
    submittedAt: integer("submitted_at"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("inspections_org_id_idx").on(t.orgId),
    index("inspections_equipment_id_idx").on(t.equipmentId),
    index("inspections_item_id_idx").on(t.facilityId),
  ],
);

/** What an inspector recorded for one checkpoint. The answer shape mirrors the
 * checkpoint's answer type; it's null until answered. Observations carry their
 * own note, photos, and (optionally) location. */
export type ObservationAnswer =
  | { type: "pass_fail"; pass: boolean }
  | { type: "numeric"; value: number }
  | { type: "rating"; value: number }
  | { type: "observation" };

export const observations = sqliteTable(
  "observations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    inspectionId: text("inspection_id")
      .notNull()
      .references(() => inspections.id),
    checkpointId: text("checkpoint_id")
      .notNull()
      .references(() => checkpoints.id),
    answer: text("answer", { mode: "json" }).$type<ObservationAnswer | null>(),
    note: text("note"),
    /** R2 object keys (not URLs) — render via R2_PUBLIC_BASE_URL + "/" + key. */
    photoKeys: text("photo_keys", { mode: "json" }).$type<string[]>(),
    capturedLat: real("captured_lat"),
    capturedLng: real("captured_lng"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("observations_inspection_id_idx").on(t.inspectionId),
    // one observation per checkpoint within an inspection
    uniqueIndex("observations_inspection_checkpoint_idx").on(
      t.inspectionId,
      t.checkpointId,
    ),
  ],
);
