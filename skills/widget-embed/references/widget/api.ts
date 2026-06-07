// Runtime-light API client for the widget. Keep this dependency-free so the
// bundle stays tiny; the server is the source of truth anyway.

export interface PublicItem {
  name: string;
  description: string | null;
}

export function apiBase(scriptSrc: string): string {
  return new URL(scriptSrc).origin;
}

export async function fetchItem(
  base: string,
  id: string,
): Promise<PublicItem> {
  const res = await fetch(`${base}/api/public/items/${id}`);
  if (!res.ok) throw new Error(`item ${id} not found`);
  return res.json() as Promise<PublicItem>;
}
