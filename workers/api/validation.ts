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
