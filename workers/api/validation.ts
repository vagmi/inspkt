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
