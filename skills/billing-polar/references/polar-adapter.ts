// Polar billing adapter. The org's Clerk id rides along as
// externalCustomerId + metadata.orgId so webhook events resolve back to us.
// Copy to workers/api/adapters/polar.ts.
import { Polar } from "@polar-sh/sdk";

export function createPolarAdapter(opts: {
  accessToken: string;
  server?: "sandbox" | "production";
}) {
  const polar = new Polar({
    accessToken: opts.accessToken,
    server: opts.server ?? "sandbox",
  });

  return {
    /** Create a checkout session; returns the URL to redirect to. */
    async createCheckout(input: {
      productId: string;
      orgId: string;
      successUrl: string;
    }): Promise<string> {
      const checkout = await polar.checkouts.create({
        products: [input.productId],
        externalCustomerId: input.orgId,
        metadata: { orgId: input.orgId },
        successUrl: input.successUrl,
      });
      return checkout.url;
    },

    /** Customer portal (manage/cancel subscription); returns the URL. */
    async createPortalSession(orgId: string): Promise<string> {
      const session = await polar.customerSessions.create({
        externalCustomerId: orgId,
      });
      return session.customerPortalUrl;
    },

    /** The org's active subscription straight from the API — used to
     * reconcile when a webhook was missed (e.g. local dev). */
    async getActiveSubscription(orgId: string): Promise<{
      id: string;
      status: string;
      productId: string;
      customerId: string;
      currentPeriodEnd: Date | null;
    } | null> {
      const page = await polar.subscriptions.list({
        externalCustomerId: orgId,
        active: true,
        limit: 1,
      });
      const sub = page.result.items[0];
      if (!sub) return null;
      return {
        id: sub.id,
        status: sub.status,
        productId: sub.productId,
        customerId: sub.customerId,
        currentPeriodEnd: sub.currentPeriodEnd ?? null,
      };
    },
  };
}

export type PolarAdapter = ReturnType<typeof createPolarAdapter>;
