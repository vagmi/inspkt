import { currentPeriod, getPlan } from "~/lib/plans";
import type { Item, ItemsRepo } from "../repositories/items-repo";
import type { UsageRepo } from "../repositories/usage-repo";
import { NotFoundError, PlanLimitError } from "./errors";

// Services hold the business rules: plan gating, usage metering, "not found"
// semantics. They depend on repositories (never on Drizzle directly) and are
// unit-tested with mocked repos. Copy this file when you add your own resource.

export interface ItemsServiceDeps {
  itemsRepo: ItemsRepo;
  usageRepo: UsageRepo;
}

export function createItemsService({ itemsRepo, usageRepo }: ItemsServiceDeps) {
  async function get(orgId: string, id: string): Promise<Item> {
    const item = await itemsRepo.getById(orgId, id);
    if (!item) throw new NotFoundError(`item ${id} not found`);
    return item;
  }

  return {
    list(orgId: string): Promise<Item[]> {
      return itemsRepo.listByOrg(orgId);
    },

    get,

    /** Gated on the org's plan: each tier caps the number of items. Also
     * bumps the monthly usage counter so the billing meter is live. */
    async create(
      orgId: string,
      plan: string,
      input: { name: string; description?: string | null },
    ): Promise<Item> {
      const limits = getPlan(plan);
      const count = await itemsRepo.countByOrg(orgId);
      if (count >= limits.maxItems) {
        throw new PlanLimitError(
          `the ${plan} plan allows ${limits.maxItems} items — upgrade to add more`,
        );
      }
      const item = await itemsRepo.create({
        orgId,
        name: input.name,
        description: input.description ?? null,
      });
      await usageRepo.increment(orgId, currentPeriod());
      return item;
    },

    async update(
      orgId: string,
      id: string,
      patch: { name?: string; description?: string | null },
    ): Promise<Item> {
      const updated = await itemsRepo.update(orgId, id, patch);
      if (!updated) throw new NotFoundError(`item ${id} not found`);
      return updated;
    },

    async delete(orgId: string, id: string): Promise<void> {
      const deleted = await itemsRepo.delete(orgId, id);
      if (!deleted) throw new NotFoundError(`item ${id} not found`);
    },
  };
}

export type ItemsService = ReturnType<typeof createItemsService>;
