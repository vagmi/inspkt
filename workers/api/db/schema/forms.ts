import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { organizations } from "./organizations";
import { now } from "./helpers";

/** Inspection forms: the reusable rubric. A form is an ordered set of
 * checkpoints (optionally grouped into sections); each checkpoint encodes how
 * it is answered and how it counts toward the verdict. Editing a form keeps
 * checkpoint ids stable where possible so past inspections stay linked. */
export const forms = sqliteTable(
  "forms",
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
  (t) => [index("forms_org_id_idx").on(t.orgId)],
);

export type CheckpointAnswerType =
  | "pass_fail"
  | "numeric"
  | "rating"
  | "observation";

export type CheckpointSeverity = "minor" | "major" | "critical";

/** Numeric readings resolve by range: inside [okMin, okMax] → pass; outside
 * but within [warnMin, warnMax] → warn; beyond that → fail. */
export interface NumericConfig {
  unit?: string;
  okMin: number;
  okMax: number;
  warnMin?: number;
  warnMax?: number;
}

/** Ratings are 1..scaleMax: ≥ passMin → pass; ≥ warnMin → warn; below → fail. */
export interface RatingConfig {
  scaleMax: number;
  passMin: number;
  warnMin?: number;
}

export type CheckpointConfig = NumericConfig | RatingConfig;

export const checkpoints = sqliteTable(
  "checkpoints",
  {
    id: text("id").primaryKey(),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    position: integer("position").notNull(),
    section: text("section"),
    prompt: text("prompt").notNull(),
    answerType: text("answer_type", {
      enum: ["pass_fail", "numeric", "rating", "observation"],
    }).notNull(),
    severity: text("severity", { enum: ["minor", "major", "critical"] })
      .notNull()
      .default("minor"),
    /** A failure here forces the whole inspection to Fail, regardless of score. */
    critical: integer("critical", { mode: "boolean" }).notNull().default(false),
    photoRequired: integer("photo_required", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Type-specific judgment config (numeric ranges / rating thresholds). */
    config: text("config", { mode: "json" }).$type<CheckpointConfig | null>(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("checkpoints_form_id_idx").on(t.formId),
    index("checkpoints_org_id_idx").on(t.orgId),
  ],
);
