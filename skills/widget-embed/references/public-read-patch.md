# Add an unscoped public read for the widget

The widget reads an item by id with no org context, so add a lookup that
isn't org-scoped. Treat the id as the capability (it's an unguessable ULID).

## `workers/api/repositories/items-repo.ts`

Add inside `createItemsRepo`:

```ts
/** Public lookup by id only — no org scoping (the id is the capability). */
async getPublicById(id: string): Promise<Item | null> {
  const [row] = await db
    .select()
    .from(items)
    .where(eq(items.id, id))
    .limit(1);
  return row ?? null;
},
```

## `workers/api/services/items-service.ts`

Add inside `createItemsService`:

```ts
async getPublic(id: string): Promise<Item> {
  const item = await itemsRepo.getPublicById(id);
  if (!item) throw new NotFoundError(`item ${id} not found`);
  return item;
},
```

Now `c.var.services.items.getPublic(id)` (used by the public controller)
resolves any item by id without a session.
