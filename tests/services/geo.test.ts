import { describe, expect, it } from "vitest";
import { haversineMeters } from "../../workers/api/services/geo";

describe("haversineMeters", () => {
  it("is zero for the same point", () => {
    expect(haversineMeters(12.97, 77.59, 12.97, 77.59)).toBeCloseTo(0);
  });

  it("matches a known short distance (~157m per 0.001° lat)", () => {
    const d = haversineMeters(12.97, 77.59, 12.9714, 77.59);
    expect(d).toBeGreaterThan(150);
    expect(d).toBeLessThan(165);
  });

  it("is symmetric", () => {
    const ab = haversineMeters(12.97, 77.59, 13.0, 77.6);
    const ba = haversineMeters(13.0, 77.6, 12.97, 77.59);
    expect(ab).toBeCloseTo(ba);
  });
});
