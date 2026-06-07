import { z } from "zod";

// Request body schemas, validated at the controller edge with @hono/zod-validator.
// Keep validation here so controllers stay thin and services trust their inputs.

export const itemCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  description: z.string().max(2000).optional(),
});

export const itemUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "no fields to update");

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
