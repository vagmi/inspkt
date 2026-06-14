import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { facilities } from "./facilities";
import { checkpoints, forms } from "./forms";
import { now } from "./helpers";
import { organizations } from "./organizations";
import { users } from "./users";

/** An inspection: one inspector working a form against a facility. Starts as a
 * draft (resumable) and finalizes on submit. Verdict/score/re-inspection
 * fields are added in Phase 11 — submit here only flips the status. Captured
 * lat/lng record where the inspection was actually performed, so it can be
 * compared against the facility's registered location.
 *
 * (Phase 9 will retarget this to Equipment; the FK column is still physically
 * `item_id` — mapped to `facilityId` — pointing at the facilities table.) */
export const inspections = sqliteTable(
  "inspections",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    facilityId: text("item_id")
      .notNull()
      .references(() => facilities.id),
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
