import { getAuth } from "@clerk/react-router/server";
import { data } from "react-router";
import { apiFetch } from "~/lib/api-client.server";
import { actorFromRole, can } from "~/lib/capabilities";
import { mintUraiSession } from "~/lib/urai.server";
import type { Route } from "./+types/urai-token";

/**
 * Mints a short-lived widget token for the embedded setup assistant. The token
 * authenticates the assistant's UraiJS tools to our API as a manager-equivalent
 * actor scoped to the caller's org. Only `can.setup` members can mint one; the
 * widget refetches this before expiry to keep the session alive.
 */
export async function loader(args: Route.LoaderArgs) {
  const auth = await getAuth(args);
  if (!auth.userId || !auth.orgId) {
    throw data({ error: "unauthenticated" }, { status: 401 });
  }

  // The app role is the authority (not the Clerk session) — read it from our API.
  const me = await apiFetch<{ orgId: string; userId: string; role: string }>(
    args.request,
    "/api/me",
  );
  if (!can.setup(actorFromRole(me.role))) {
    throw data({ error: "forbidden" }, { status: 403 });
  }

  const { token, exp } = await mintUraiSession({
    orgId: me.orgId,
    userId: me.userId,
  });
  return { token, exp };
}
