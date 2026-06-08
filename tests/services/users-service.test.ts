import { describe, expect, it, vi } from "vitest";
import { createUsersService } from "../../workers/api/services/users-service";
import { fakeUser, mockUsersRepo } from "../helpers/mocks";

function makeService() {
  const usersRepo = mockUsersRepo();
  const service = createUsersService({ usersRepo });
  return { service, usersRepo };
}

describe("users service — ensureUser", () => {
  it("returns the existing mirror row without fetching from Clerk", async () => {
    const { service, usersRepo } = makeService();
    usersRepo.getById.mockResolvedValue(fakeUser());
    const fetchProfile = vi.fn();

    const user = await service.ensureUser("user_test_1", fetchProfile);
    expect(user.id).toBe("user_test_1");
    expect(fetchProfile).not.toHaveBeenCalled();
    expect(usersRepo.ensure).not.toHaveBeenCalled();
  });

  it("fetches the profile and creates the row on first sight", async () => {
    const { service, usersRepo } = makeService();
    usersRepo.getById.mockResolvedValue(null);
    usersRepo.ensure.mockResolvedValue(fakeUser({ id: "user_new" }));
    const fetchProfile = vi.fn().mockResolvedValue({ email: "new@example.com" });

    const user = await service.ensureUser("user_new", fetchProfile);
    expect(fetchProfile).toHaveBeenCalledOnce();
    expect(usersRepo.ensure).toHaveBeenCalledWith("user_new", {
      email: "new@example.com",
    });
    expect(user.id).toBe("user_new");
  });
});

describe("users service — syncFromClerk", () => {
  it("upserts the primary email on user.created/updated", async () => {
    const { service, usersRepo } = makeService();
    await service.syncFromClerk({
      type: "user.updated",
      data: {
        id: "user_x",
        primary_email_address_id: "ema_2",
        email_addresses: [
          { id: "ema_1", email_address: "old@example.com" },
          { id: "ema_2", email_address: "primary@example.com" },
        ],
        first_name: "Eve",
      },
    });
    expect(usersRepo.upsert).toHaveBeenCalledWith("user_x", {
      email: "primary@example.com",
      firstName: "Eve",
      lastName: null,
      imageUrl: null,
    });
  });

  it("deletes on user.deleted and ignores other events", async () => {
    const { service, usersRepo } = makeService();
    await service.syncFromClerk({ type: "user.deleted", data: { id: "user_x" } });
    expect(usersRepo.delete).toHaveBeenCalledWith("user_x");

    usersRepo.upsert.mockClear();
    await service.syncFromClerk({ type: "session.created", data: { id: "x" } });
    expect(usersRepo.upsert).not.toHaveBeenCalled();
  });
});
