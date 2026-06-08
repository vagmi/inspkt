# Add the subscription columns to the organizations table

The base template ships a lean `organizations` table (`id`, `name`, `slug`,
`plan`, timestamps). Billing needs four more columns to record the Polar
customer/subscription and the current period. Edit
`workers/api/db/schema/organizations.ts`:

```ts
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug"),
  plan: text("plan").notNull().default("free"),
  // ── added by billing-polar ──
  polarCustomerId: text("polar_customer_id"),
  polarSubscriptionId: text("polar_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  currentPeriodEnd: integer("current_period_end"),
  // ────────────────────────────
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
});
```

Then generate + apply an **additive** migration (this only `ALTER TABLE`s, it
won't touch existing rows):

```
pnpm db:generate
pnpm db:migrate:local
```

`polar_customer_id` and `polar_subscription_id` tie the org to Polar;
`subscription_status` / `current_period_end` drive the billing page's "active"
state. The Polar webhook receiver is the **single writer** of these columns
(see `references/billing-service.ts`).
