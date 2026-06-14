import type {
  Client,
  ClientCreate,
  ClientsRepo,
  ClientUpdate,
} from "../repositories/clients-repo";
import { NotFoundError } from "./errors";

// Clients are the customers the org inspects for; facilities (Phase 7) hang off
// them. CRUD with "not found" semantics. A plan gate on client count can be
// added in the billing phase via the getPlan() pattern.

export interface ClientsServiceDeps {
  clientsRepo: ClientsRepo;
}

export function createClientsService({ clientsRepo }: ClientsServiceDeps) {
  return {
    list(orgId: string): Promise<Client[]> {
      return clientsRepo.listByOrg(orgId);
    },

    async get(orgId: string, id: string): Promise<Client> {
      const client = await clientsRepo.getById(orgId, id);
      if (!client) throw new NotFoundError(`client ${id} not found`);
      return client;
    },

    create(
      orgId: string,
      input: Omit<ClientCreate, "orgId">,
    ): Promise<Client> {
      return clientsRepo.create({ ...input, orgId });
    },

    async update(
      orgId: string,
      id: string,
      patch: ClientUpdate,
    ): Promise<Client> {
      const updated = await clientsRepo.update(orgId, id, patch);
      if (!updated) throw new NotFoundError(`client ${id} not found`);
      return updated;
    },

    async delete(orgId: string, id: string): Promise<void> {
      const deleted = await clientsRepo.delete(orgId, id);
      if (!deleted) throw new NotFoundError(`client ${id} not found`);
    },
  };
}

export type ClientsService = ReturnType<typeof createClientsService>;
