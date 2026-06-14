import { z } from "zod";

// Request body schemas, validated at the controller edge with @hono/zod-validator.
// Keep validation here so controllers stay thin and services trust their inputs.

const latLngPair = (v: {
  locationLat?: number | null;
  locationLng?: number | null;
}) => (v.locationLat == null) === (v.locationLng == null);

export const itemCreateSchema = z
  .object({
    name: z.string().min(1, "name is required").max(200),
    description: z.string().max(2000).optional(),
    category: z.string().max(100).optional(),
    locationLat: z.number().min(-90).max(90).optional(),
    locationLng: z.number().min(-180).max(180).optional(),
    locationLabel: z.string().max(300).optional(),
  })
  .refine(latLngPair, "locationLat and locationLng must be set together");

export const itemUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
    locationLat: z.number().min(-90).max(90).nullable().optional(),
    locationLng: z.number().min(-180).max(180).nullable().optional(),
    locationLabel: z.string().max(300).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "no fields to update")
  .refine(latLngPair, "locationLat and locationLng must be set together");

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

// ---- Forms & checkpoints ----------------------------------------------

const checkpointBase = z.object({
  id: z.string().max(64).optional(),
  section: z.string().max(120).optional(),
  prompt: z.string().min(1, "prompt is required").max(500),
  severity: z.enum(["minor", "major", "critical"]).default("minor"),
  critical: z.boolean().default(false),
  photoRequired: z.boolean().default(false),
});

const numericConfigSchema = z
  .object({
    unit: z.string().max(20).optional(),
    okMin: z.number(),
    okMax: z.number(),
    warnMin: z.number().optional(),
    warnMax: z.number().optional(),
  })
  .refine((c) => c.okMin <= c.okMax, "okMin must be ≤ okMax")
  .refine(
    (c) => c.warnMin === undefined || c.warnMin <= c.okMin,
    "warnMin must be ≤ okMin",
  )
  .refine(
    (c) => c.warnMax === undefined || c.warnMax >= c.okMax,
    "warnMax must be ≥ okMax",
  );

const ratingConfigSchema = z
  .object({
    scaleMax: z.number().int().min(2).max(10),
    passMin: z.number().int().min(1),
    warnMin: z.number().int().min(1).optional(),
  })
  .refine((c) => c.passMin <= c.scaleMax, "passMin must be ≤ scaleMax")
  .refine(
    (c) => c.warnMin === undefined || c.warnMin < c.passMin,
    "warnMin must be < passMin",
  );

/** Each answer type carries exactly the config it needs; observations are
 * context-only and can never be critical (they produce no pass/fail). */
export const checkpointSchema = z.discriminatedUnion("answerType", [
  checkpointBase.extend({ answerType: z.literal("pass_fail") }),
  checkpointBase.extend({
    answerType: z.literal("numeric"),
    config: numericConfigSchema,
  }),
  checkpointBase.extend({
    answerType: z.literal("rating"),
    config: ratingConfigSchema,
  }),
  checkpointBase.extend({
    answerType: z.literal("observation"),
    critical: z
      .literal(false, { message: "observations cannot be critical" })
      .default(false),
  }),
]);

export const formCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  description: z.string().max(2000).optional(),
  checkpoints: z.array(checkpointSchema).max(200).default([]),
});

export const formUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    checkpoints: z.array(checkpointSchema).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "no fields to update");

export type CheckpointInputParsed = z.infer<typeof checkpointSchema>;
export type FormCreateInput = z.infer<typeof formCreateSchema>;
export type FormUpdateInput = z.infer<typeof formUpdateSchema>;

// ---- Inspections & observations ---------------------------------------

const capturedLatLngPair = (v: {
  capturedLat?: number | null;
  capturedLng?: number | null;
}) => (v.capturedLat == null) === (v.capturedLng == null);

export const inspectionCreateSchema = z
  .object({
    itemId: z.string().min(1),
    formId: z.string().min(1),
    capturedLat: z.number().min(-90).max(90).optional(),
    capturedLng: z.number().min(-180).max(180).optional(),
  })
  .refine(
    capturedLatLngPair,
    "capturedLat and capturedLng must be set together",
  );

/** An answer mirrors its checkpoint's type; the walker omits it until answered. */
const observationAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pass_fail"), pass: z.boolean() }),
  z.object({ type: z.literal("numeric"), value: z.number() }),
  z.object({ type: z.literal("rating"), value: z.number().int() }),
  z.object({ type: z.literal("observation") }),
]);

const observationInputSchema = z
  .object({
    checkpointId: z.string().min(1),
    answer: observationAnswerSchema.nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    photoKeys: z.array(z.string().max(300)).max(20).nullable().optional(),
    capturedLat: z.number().min(-90).max(90).nullable().optional(),
    capturedLng: z.number().min(-180).max(180).nullable().optional(),
  })
  .refine(
    (v) => (v.capturedLat == null) === (v.capturedLng == null),
    "capturedLat and capturedLng must be set together",
  );

export const inspectionSaveSchema = z.object({
  observations: z.array(observationInputSchema).max(500).default([]),
});

export type InspectionCreateInput = z.infer<typeof inspectionCreateSchema>;
export type InspectionSaveInput = z.infer<typeof inspectionSaveSchema>;
