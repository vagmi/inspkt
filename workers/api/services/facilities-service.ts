import { currentPeriod, getPlan } from "~/lib/plans";
import type { ClientsRepo } from "../repositories/clients-repo";
import type {
  Facility,
  FacilityCreate,
  FacilitiesRepo,
  FacilityListRow,
  FacilityUpdate,
} from "../repositories/facilities-repo";
import type { UsageRepo } from "../repositories/usage-repo";
import { NotFoundError, PlanLimitError } from "./errors";

// Facilities are sites belonging to a client. Business rules: the client must
// belong to the org, the plan caps how many facilities an org can register, and
// creation bumps the monthly usage meter.

export interface FacilitiesServiceDeps {
  facilitiesRepo: FacilitiesRepo;
  clientsRepo: ClientsRepo;
  usageRepo: UsageRepo;
}

export function createFacilitiesService({
  facilitiesRepo,
  clientsRepo,
  usageRepo,
}: FacilitiesServiceDeps) {
  async function assertClient(orgId: string, clientId: string): Promise<void> {
    const client = await clientsRepo.getById(orgId, clientId);
    if (!client) throw new NotFoundError(`client ${clientId} not found`);
  }

  async function get(orgId: string, id: string): Promise<Facility> {
    const facility = await facilitiesRepo.getById(orgId, id);
    if (!facility) throw new NotFoundError(`facility ${id} not found`);
    return facility;
  }

  return {
    list(orgId: string): Promise<FacilityListRow[]> {
      return facilitiesRepo.listByOrg(orgId);
    },

    get,

    /** Gated on the org's plan (max facilities) and validated against the
     * owning client. Bumps the monthly usage counter. */
    async create(
      orgId: string,
      plan: string,
      input: Omit<FacilityCreate, "orgId">,
    ): Promise<Facility> {
      await assertClient(orgId, input.clientId);

      const limits = getPlan(plan);
      const count = await facilitiesRepo.countByOrg(orgId);
      if (count >= limits.maxFacilities) {
        throw new PlanLimitError(
          `the ${plan} plan allows ${limits.maxFacilities} facilities — upgrade to add more`,
        );
      }
      const facility = await facilitiesRepo.create({ ...input, orgId });
      await usageRepo.increment(orgId, currentPeriod());
      return facility;
    },

    async update(
      orgId: string,
      id: string,
      patch: FacilityUpdate,
    ): Promise<Facility> {
      if (patch.clientId !== undefined) {
        await assertClient(orgId, patch.clientId);
      }
      const updated = await facilitiesRepo.update(orgId, id, patch);
      if (!updated) throw new NotFoundError(`facility ${id} not found`);
      return updated;
    },

    async delete(orgId: string, id: string): Promise<void> {
      const deleted = await facilitiesRepo.delete(orgId, id);
      if (!deleted) throw new NotFoundError(`facility ${id} not found`);
    },
  };
}

export type FacilitiesService = ReturnType<typeof createFacilitiesService>;
