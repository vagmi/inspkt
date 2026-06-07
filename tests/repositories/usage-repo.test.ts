import { describe, expect, it } from "vitest";
import { createUsageRepo } from "../../workers/api/repositories/usage-repo";
import { testDb } from "../helpers/fixtures";

describe("usage repo", () => {
  it("returns 0 with no counter row", async () => {
    const db = testDb();
    expect(await createUsageRepo(db).getCount("org_x", "2026-06")).toBe(0);
  });

  it("increments atomically and tracks history newest-first", async () => {
    const usage = createUsageRepo(testDb());

    await usage.increment("org_test_1", "2026-04");
    await usage.increment("org_test_1", "2026-05");
    await usage.increment("org_test_1", "2026-05");
    await usage.increment("org_test_1", "2026-06", 3);

    expect(await usage.getCount("org_test_1", "2026-05")).toBe(2);
    expect(await usage.getCount("org_test_1", "2026-06")).toBe(3);

    const history = await usage.history("org_test_1");
    expect(history.map((h) => h.period)).toEqual([
      "2026-06",
      "2026-05",
      "2026-04",
    ]);
  });
});
