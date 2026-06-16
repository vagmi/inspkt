// Server-only helpers for the embedded Urai setup assistant. Keeping the
// `cloudflare:workers` env access and token minting in a `.server` module
// guarantees they're stripped from the client bundle.
import { env } from "cloudflare:workers";
import { mintWidgetToken } from "../../workers/api/lib/widget-token";

/** Widget tokens are short-lived; the browser refetches before this elapses. */
const TTL_SECONDS = 15 * 60;

const DEFAULT_CHAT_BASE = "https://chat.app.urai.dev";

export interface UraiConfig {
  /** chat-service origin the browser widget talks to. */
  chatBase: string;
  /** Public widget token from the Urai dashboard. */
  widgetToken: string;
  /** Stable visitor id for the widget (the Clerk user). */
  userId: string;
  orgId: string;
  /** The short-lived signed token the tools authenticate with — passed to the
   *  widget as `vars.metadata._widget_token`. The API base the tools call is
   *  configured on the Urai side as the `URAI_API_HOST` secret, not here. */
  token: string;
  /** Token expiry, epoch seconds. */
  exp: number;
}

/** Mint a fresh widget session token for an org/user (manager-equivalent). */
export function mintUraiSession(args: { orgId: string; userId: string }) {
  return mintWidgetToken(env.WIDGET_TOKEN_SECRET, {
    orgId: args.orgId,
    userId: args.userId,
    role: "manager",
    ttlSeconds: TTL_SECONDS,
  });
}

/**
 * Full embed config for the setup assistant, or null when the widget isn't
 * configured (no `URAI_WIDGET_TOKEN`) — callers then simply don't render it.
 */
export async function getUraiConfig(args: {
  orgId: string;
  userId: string;
}): Promise<UraiConfig | null> {
  if (!env.URAI_WIDGET_TOKEN) return null;
  const { token, exp } = await mintUraiSession(args);
  return {
    chatBase: env.URAI_CHAT_BASE || DEFAULT_CHAT_BASE,
    widgetToken: env.URAI_WIDGET_TOKEN,
    userId: args.userId,
    orgId: args.orgId,
    token,
    exp,
  };
}
