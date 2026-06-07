// Org-scoped webhook management. Gated on the plan's `webhooks` flag.
// Copy to: workers/api/services/webhooks-service.ts
import { getPlan } from "~/lib/plans";
import type { SvixAdapter } from "../adapters/svix";
import type { Organization } from "../repositories/organizations-repo";
import { PlanLimitError } from "./errors";

export interface WebhooksServiceDeps {
  svix: SvixAdapter;
}

export function createWebhooksService({ svix }: WebhooksServiceDeps) {
  function assertAllowed(plan: string) {
    if (!getPlan(plan).webhooks) {
      throw new PlanLimitError("webhooks require a paid plan");
    }
  }

  return {
    list(orgId: string) {
      return svix.listEndpoints(orgId);
    },

    async create(org: Organization, input: { url: string; description?: string }) {
      assertAllowed(org.plan);
      // Lazily provision the org's Svix app the first time it adds a webhook.
      await svix.ensureApp(org.id, org.name);
      return svix.createEndpoint(org.id, input);
    },

    delete(orgId: string, endpointId: string) {
      return svix.deleteEndpoint(orgId, endpointId);
    },

    getSecret(orgId: string, endpointId: string) {
      return svix.getEndpointSecret(orgId, endpointId);
    },

    listDeliveries(orgId: string, endpointId: string) {
      return svix.listAttempts(orgId, endpointId);
    },
  };
}

export type WebhooksService = ReturnType<typeof createWebhooksService>;
