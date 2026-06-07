import { env } from "cloudflare:workers";
import { api } from "../../workers/api/instance";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API ${status}: ${body}`);
  }
}

/**
 * Invoke the Hono API in-process from a React Router loader/action — same
 * API surface as the network, no self-fetch. Forwards the incoming cookie
 * header so Clerk session auth works.
 *
 * @param request the incoming RR request (for cookies)
 * @param path    full API path, e.g. "/api/items"
 */
export async function apiFetch<T>(
  request: Request,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const cookie = request.headers.get("cookie");
  if (cookie && !headers.has("cookie")) headers.set("cookie", cookie);

  const res = await api.request(path, { ...init, headers }, env);
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return res.json() as Promise<T>;
}
