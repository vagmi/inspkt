import type { FieldDef } from "../db/schema/equipment";
import { ValidationError } from "./errors";

// Validate an equipment record's metadata against its type's field schema.
// Pure (no I/O) so it's unit-tested directly. Throws ValidationError on the
// first problem; rejects values for fields the type doesn't define.

function isPresent(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateMetadata(
  fields: FieldDef[],
  metadata: Record<string, unknown> | undefined,
): void {
  const data = metadata ?? {};
  const byKey = new Map(fields.map((f) => [f.key, f]));

  for (const key of Object.keys(data)) {
    if (!byKey.has(key)) {
      throw new ValidationError(`unknown field "${key}" for this type`);
    }
  }

  for (const field of fields) {
    const value = data[field.key];
    if (!isPresent(value)) {
      if (field.required) {
        throw new ValidationError(`"${field.label}" is required`);
      }
      continue;
    }

    const bad = (expected: string): never => {
      throw new ValidationError(`"${field.label}" must be ${expected}`);
    };

    switch (field.type) {
      case "text":
        if (typeof value !== "string") bad("text");
        break;
      case "number":
        if (typeof value !== "number" || Number.isNaN(value)) bad("a number");
        break;
      case "date":
        if (typeof value !== "string" || !ISO_DATE.test(value))
          bad("a date (YYYY-MM-DD)");
        break;
      case "boolean":
        if (typeof value !== "boolean") bad("yes or no");
        break;
      case "select":
        if (typeof value !== "string" || !field.options?.includes(value))
          bad("one of the allowed options");
        break;
      case "multiselect":
        if (
          !Array.isArray(value) ||
          !value.every(
            (v) => typeof v === "string" && field.options?.includes(v),
          )
        )
          bad("a set of the allowed options");
        break;
      case "file":
        if (
          typeof value !== "object" ||
          value === null ||
          typeof (value as { key?: unknown }).key !== "string"
        )
          bad("an uploaded file");
        break;
    }
  }
}
