import type {
  Organization,
  OrganizationsRepo,
} from "../repositories/organizations-repo";

export interface ClerkOrgDetails {
  name: string;
  slug?: string | null;
}

/** Structural view of Clerk organization.* webhook events. */
export interface ClerkOrgEvent {
  type: string;
  data: { id: string; name?: string; slug?: string | null };
}

export function createOrganizationsService(deps: {
  orgsRepo: OrganizationsRepo;
}) {
  return {
    /**
     * Return the local mirror row for a Clerk org, lazily creating it on
     * first sight. `fetchDetails` is only invoked when the row is missing
     * (it costs a Clerk API call).
     */
    async ensureOrg(
      orgId: string,
      fetchDetails: () => Promise<ClerkOrgDetails>,
    ): Promise<Organization> {
      const existing = await deps.orgsRepo.getById(orgId);
      if (existing) return existing;

      const details = await fetchDetails();
      return deps.orgsRepo.ensure(orgId, details.name, details.slug ?? null);
    },

    getById(orgId: string): Promise<Organization | null> {
      return deps.orgsRepo.getById(orgId);
    },

    /** Keep the local mirror in sync with Clerk organization webhooks. */
    async syncFromClerk(event: ClerkOrgEvent): Promise<void> {
      const { id, name, slug } = event.data;
      switch (event.type) {
        case "organization.created":
          await deps.orgsRepo.ensure(id, name ?? "", slug ?? null);
          break;
        case "organization.updated":
          await deps.orgsRepo.ensure(id, name ?? "", slug ?? null);
          await deps.orgsRepo.updateFromClerk(id, {
            name: name ?? "",
            slug: slug ?? null,
          });
          break;
        case "organization.deleted":
          await deps.orgsRepo.delete(id);
          break;
        default:
          break;
      }
    },
  };
}

export type OrganizationsService = ReturnType<
  typeof createOrganizationsService
>;
