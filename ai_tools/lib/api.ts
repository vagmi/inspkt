// Shared helpers for the inspkt setup-assistant tools. `meta` is a UraiJS
// global (a WinterTC V8 runtime: fetch only, no Node APIs). Auth and context
// arrive from the widget embed and the platform:
//   meta.secrets.URAI_API_HOST        — inspkt API origin (dashboard secret)
//   meta.vars.metadata._widget_token  — short-lived bearer token (inspktw_…)
//   meta.vars.metadata.org_id         — org id (also baked into the token)
//   meta.vars.metadata._chat_log_id   — conversation id (for sendCommand)
//
// The token is manager-scoped and verified server-side on every request, so
// these tools just call the existing `/api/*` write routes — no org id in the
// URL, no privileged secret on the wire.

function apiHost(): string {
  return meta.secrets.URAI_API_HOST || "http://localhost:5173";
}

/** Best-effort host-page signal via the chat log id; never throws. */
async function sendCommand(payload: unknown): Promise<void> {
  const chatLogId = meta.vars.metadata?._chat_log_id;
  if (!chatLogId) return;
  try {
    await meta.urai.sendCommand(chatLogId, payload);
  } catch (e) {
    console.warn("sendCommand failed:", e);
  }
}

/** Call the inspkt API with the widget's short-lived bearer token. Tool-call
 * progress is shown by the widget natively (v0.1.1 tool traces), so no manual
 * notification is sent here. */
export async function apiFetch(
  method: string,
  path: string,
  body?: unknown,
): Promise<any> {
  const token = meta.vars.metadata?._widget_token;
  if (!token) {
    throw new Error("missing _widget_token in session metadata");
  }
  const res = await fetch(`${apiHost()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // Surface the API error so the model can correct the input or explain it.
    throw new Error(`inspkt API ${res.status} on ${method} ${path}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * Ask the host page to navigate (routed to the widget via the chat log id).
 * The widget validates the payload before acting; best-effort, never throws.
 */
export async function navigate(path: string): Promise<void> {
  await sendCommand({ type: "navigate", payload: { path } });
}

/** Drop undefined keys so optional args don't reach the API as nulls. */
export function clean(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}
