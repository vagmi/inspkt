import { describe, expect, it } from "vitest";
import { createOrganizationsRepo } from "../../workers/api/repositories/organizations-repo";
import { testDb } from "../helpers/fixtures";

describe("organizations repo", () => {
  it("ensure creates a row and is idempotent", async () => {
    const repo = createOrganizationsRepo(testDb());

    const org = await repo.ensure("org_abc", "Acme", "acme");
    expect(org.id).toBe("org_abc");
    expect(org.plan).toBe("free");

    // Second call must not overwrite or fail.
    const again = await repo.ensure("org_abc", "Different Name");
    expect(again.name).toBe("Acme");
  });

  it("updates name/slug from Clerk", async () => {
    const repo = createOrganizationsRepo(testDb());
    await repo.ensure("org_abc", "Acme", "acme");

    await repo.updateFromClerk("org_abc", {
      name: "Acme Inc",
      slug: "acme-inc",
    });
    const org = await repo.getById("org_abc");
    expect(org?.name).toBe("Acme Inc");
    expect(org?.slug).toBe("acme-inc");
  });

  it("deletes", async () => {
    const repo = createOrganizationsRepo(testDb());
    await repo.ensure("org_gone", "Gone");
    await repo.delete("org_gone");
    expect(await repo.getById("org_gone")).toBeNull();
  });

  it("returns null for unknown ids", async () => {
    const repo = createOrganizationsRepo(testDb());
    expect(await repo.getById("org_nope")).toBeNull();
  });
});
