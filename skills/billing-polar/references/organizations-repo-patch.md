# Add `updateBilling` to the organizations repository

The billing service is the single writer of the org's subscription columns, but
the actual Drizzle `UPDATE` must live in the repository (strict layering — see
AGENTS.md). Add a `BillingUpdate` type and an `updateBilling` method to
`workers/api/repositories/organizations-repo.ts`.

At the top, alongside `export type Organization = ...`:

```ts
export interface BillingUpdate {
  plan?: string;
  polarCustomerId?: string | null;
  polarSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: number | null;
}
```

Inside the returned object (e.g. just before `delete`):

```ts
    /** Polar webhook receiver is the single writer of billing fields. */
    async updateBilling(id: string, update: BillingUpdate): Promise<void> {
      await db
        .update(organizations)
        .set({ ...update, updatedAt: now() })
        .where(eq(organizations.id, id));
    },
```

`now` and `eq` are already imported at the top of the file. The
`...update` spread only writes the keys you pass, so a webhook that omits `plan`
(e.g. `subscription.canceled`) leaves the plan untouched.
