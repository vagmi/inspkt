import { describe, expect, it } from "vitest";
import { createUsersRepo } from "../../workers/api/repositories/users-repo";
import { testDb } from "../helpers/fixtures";

describe("users repo", () => {
  it("ensure creates a row and is idempotent (no profile overwrite)", async () => {
    const repo = createUsersRepo(testDb());

    const user = await repo.ensure("user_a", {
      email: "a@example.com",
      firstName: "Ann",
    });
    expect(user.id).toBe("user_a");
    expect(user.email).toBe("a@example.com");

    // ensure must not overwrite an existing profile.
    const again = await repo.ensure("user_a", { email: "changed@example.com" });
    expect(again.email).toBe("a@example.com");
  });

  it("upsert refreshes the profile", async () => {
    const repo = createUsersRepo(testDb());
    await repo.ensure("user_b", { email: "b@example.com", firstName: "Bee" });

    await repo.upsert("user_b", {
      email: "b2@example.com",
      firstName: "Bea",
      lastName: "Bee",
    });
    const user = await repo.getById("user_b");
    expect(user?.email).toBe("b2@example.com");
    expect(user?.firstName).toBe("Bea");
    expect(user?.lastName).toBe("Bee");
  });

  it("updates profile from Clerk and deletes", async () => {
    const repo = createUsersRepo(testDb());
    await repo.ensure("user_c", { email: "c@example.com" });

    await repo.updateFromClerk("user_c", {
      email: "c@new.com",
      firstName: "Cee",
    });
    expect((await repo.getById("user_c"))?.email).toBe("c@new.com");

    await repo.delete("user_c");
    expect(await repo.getById("user_c")).toBeNull();
  });
});
