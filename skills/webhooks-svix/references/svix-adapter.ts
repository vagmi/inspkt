// Svix handles outbound webhook delivery: signing, retries with backoff, and
// the delivery log. Our model maps onto it as:
//   Svix application = organization (app uid = Clerk org id)
//   Svix endpoint    = a webhook the org configured
// Copy to: workers/api/adapters/svix.ts
import { Svix } from "svix";

/** The event types your app emits. Add more as needed. */
export const ITEM_CREATED_EVENT = "item.created";

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string;
  disabled: boolean;
  createdAt: string;
}

export interface DeliveryAttempt {
  id: string;
  status: "success" | "pending" | "failed";
  responseCode: number;
  timestamp: string;
  url: string;
}

function toEndpoint(ep: {
  id: string;
  url: string;
  description?: string;
  disabled?: boolean;
  createdAt: Date | string;
}): WebhookEndpoint {
  return {
    id: ep.id,
    url: ep.url,
    description: ep.description ?? "",
    disabled: ep.disabled ?? false,
    createdAt:
      typeof ep.createdAt === "string"
        ? ep.createdAt
        : ep.createdAt.toISOString(),
  };
}

const ATTEMPT_STATUS: Record<number, DeliveryAttempt["status"]> = {
  0: "success",
  1: "pending",
  2: "failed",
  3: "pending",
};

export function createSvixAdapter(apiKey: string) {
  const svix = new Svix(apiKey);

  return {
    /** Idempotently create the org's Svix application (uid = org id). */
    async ensureApp(orgId: string, orgName: string): Promise<void> {
      await svix.application.getOrCreate({ name: orgName, uid: orgId });
    },

    async listEndpoints(orgId: string): Promise<WebhookEndpoint[]> {
      try {
        const res = await svix.endpoint.list(orgId);
        return res.data.map(toEndpoint);
      } catch (e) {
        if (isNotFound(e)) return []; // org never configured webhooks
        throw e;
      }
    },

    async createEndpoint(
      orgId: string,
      input: { url: string; description?: string },
    ): Promise<WebhookEndpoint> {
      const ep = await svix.endpoint.create(orgId, {
        url: input.url,
        description: input.description,
      });
      return toEndpoint(ep);
    },

    async deleteEndpoint(orgId: string, endpointId: string): Promise<void> {
      await svix.endpoint.delete(orgId, endpointId);
    },

    async getEndpointSecret(
      orgId: string,
      endpointId: string,
    ): Promise<string> {
      const res = await svix.endpoint.getSecret(orgId, endpointId);
      return res.key;
    },

    /** Recent delivery attempts for an endpoint (Svix keeps the log). */
    async listAttempts(
      orgId: string,
      endpointId: string,
      limit = 20,
    ): Promise<DeliveryAttempt[]> {
      const res = await svix.messageAttempt.listByEndpoint(orgId, endpointId, {
        limit,
      });
      return res.data.map((a) => ({
        id: a.id,
        status: ATTEMPT_STATUS[a.status as number] ?? "failed",
        responseCode: a.responseStatusCode,
        timestamp:
          typeof a.timestamp === "string"
            ? a.timestamp
            : a.timestamp.toISOString(),
        url: a.url,
      }));
    },

    /**
     * Fan out an event to the org's endpoints. No-op (404) when the org has
     * no Svix app — i.e. it never configured a webhook.
     */
    async sendEvent(
      orgId: string,
      eventType: string,
      payload: Record<string, unknown>,
    ): Promise<void> {
      try {
        await svix.message.create(orgId, {
          eventType,
          payload: { type: eventType, ...payload },
        });
      } catch (e) {
        if (isNotFound(e)) return;
        throw e;
      }
    },
  };
}

function isNotFound(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: number }).code === 404
  );
}

export type SvixAdapter = ReturnType<typeof createSvixAdapter>;
