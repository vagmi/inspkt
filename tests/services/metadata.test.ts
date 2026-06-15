import { describe, expect, it } from "vitest";
import type { FieldDef } from "../../workers/api/db/schema/equipment";
import { ValidationError } from "../../workers/api/services/errors";
import { validateMetadata } from "../../workers/api/services/metadata";

const F = (over: Partial<FieldDef> & Pick<FieldDef, "key" | "type">): FieldDef => ({
  label: over.key,
  required: false,
  ...over,
});

describe("validateMetadata", () => {
  it("accepts well-formed values for every type", () => {
    const fields: FieldDef[] = [
      F({ key: "plate", type: "text" }),
      F({ key: "year", type: "number" }),
      F({ key: "reg_date", type: "date" }),
      F({ key: "active", type: "boolean" }),
      F({ key: "body", type: "select", options: ["Van", "Truck"] }),
      F({ key: "tags", type: "multiselect", options: ["a", "b", "c"] }),
      F({ key: "doc", type: "file" }),
    ];
    expect(() =>
      validateMetadata(fields, {
        plate: "ABC123",
        year: 2022,
        reg_date: "2022-05-01",
        active: true,
        body: "Van",
        tags: ["a", "c"],
        doc: { key: "org/abc.pdf", name: "ins.pdf" },
      }),
    ).not.toThrow();
  });

  it("rejects a missing required field", () => {
    const fields = [F({ key: "vin", type: "text", required: true })];
    expect(() => validateMetadata(fields, {})).toThrow(ValidationError);
  });

  it("skips an absent optional field", () => {
    const fields = [F({ key: "nickname", type: "text" })];
    expect(() => validateMetadata(fields, {})).not.toThrow();
  });

  it("rejects an unknown field key", () => {
    const fields = [F({ key: "plate", type: "text" })];
    expect(() => validateMetadata(fields, { mystery: "x" })).toThrow(
      ValidationError,
    );
  });

  it("type-checks: number, date, select, multiselect", () => {
    expect(() =>
      validateMetadata([F({ key: "n", type: "number" })], { n: "ten" }),
    ).toThrow(ValidationError);
    expect(() =>
      validateMetadata([F({ key: "d", type: "date" })], { d: "01/05/2022" }),
    ).toThrow(ValidationError);
    expect(() =>
      validateMetadata(
        [F({ key: "s", type: "select", options: ["a"] })],
        { s: "z" },
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateMetadata(
        [F({ key: "m", type: "multiselect", options: ["a", "b"] })],
        { m: ["a", "z"] },
      ),
    ).toThrow(ValidationError);
  });

  it("rejects a file value without a key", () => {
    expect(() =>
      validateMetadata([F({ key: "doc", type: "file" })], {
        doc: { name: "x.pdf" },
      }),
    ).toThrow(ValidationError);
  });
});
