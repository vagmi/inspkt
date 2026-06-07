import { describe, expect, it, vi } from "vitest";
import { createOrganizationsService } from "../../workers/api/services/organizations-service";
import { fakeOrg, mockOrganizationsRepo } from "../helpers/mocks";

describe("organizations service", () => {
  it("returns the existing row without fetching Clerk details", async () => {
    const orgsRepo = mockOrganizationsRepo();
    const existing = fakeOrg();
    orgsRepo.getById.mockResolvedValue(existing);
    const fetchDetails = vi.fn();

    const service = createOrganizationsService({ orgsRepo });
    const org = await service.ensureOrg("org_test_1", fetchDetails);

    expect(org).toBe(existing);
    expect(fetchDetails).not.toHaveBeenCalled();
    expect(orgsRepo.ensure).not.toHaveBeenCalled();
  });

  it("syncs Clerk organization webhooks", async () => {
    const orgsRepo = mockOrganizationsRepo();
    const service = createOrganizationsService({ orgsRepo });

    await service.syncFromClerk({
      type: "organization.created",
      data: { id: "org_1", name: "Acme", slug: "acme" },
    });
    expect(orgsRepo.ensure).toHaveBeenCalledWith("org_1", "Acme", "acme");

    await service.syncFromClerk({
      type: "organization.updated",
      data: { id: "org_1", name: "Acme Inc", slug: "acme-inc" },
    });
    expect(orgsRepo.updateFromClerk).toHaveBeenCalledWith("org_1", {
      name: "Acme Inc",
      slug: "acme-inc",
    });

    await service.syncFromClerk({
      type: "organization.deleted",
      data: { id: "org_1" },
    });
    expect(orgsRepo.delete).toHaveBeenCalledWith("org_1");

    // unrelated events are ignored
    orgsRepo.ensure.mockClear();
    await service.syncFromClerk({
      type: "user.created",
      data: { id: "user_1" },
    });
    expect(orgsRepo.ensure).not.toHaveBeenCalled();
  });

  it("fetches details and creates the mirror row on first sight", async () => {
    const orgsRepo = mockOrganizationsRepo();
    orgsRepo.getById.mockResolvedValue(null);
    const created = fakeOrg({ id: "org_new", name: "New Org" });
    orgsRepo.ensure.mockResolvedValue(created);
    const fetchDetails = vi
      .fn()
      .mockResolvedValue({ name: "New Org", slug: "new-org" });

    const service = createOrganizationsService({ orgsRepo });
    const org = await service.ensureOrg("org_new", fetchDetails);

    expect(org).toBe(created);
    expect(fetchDetails).toHaveBeenCalledOnce();
    expect(orgsRepo.ensure).toHaveBeenCalledWith(
      "org_new",
      "New Org",
      "new-org",
    );
  });
});
