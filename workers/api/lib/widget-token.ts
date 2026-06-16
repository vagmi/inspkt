// Widget session tokens (`inspktw_…`) — short-lived, signed, org-scoped bearer
// credentials minted for the embedded Urai chat widget. They are passed to the
// widget through `vars` (browser-visible + stored on the Urai thread), so they
// carry NO server secret: the payload is signed and the API re-verifies it on
// every request. orgId/role come from the signed payload, never from a separate
// vars field — a tampered `vars` cannot change tenancy.
//
// Format: `inspktw_<base64url(JSON payload)>.<base64url(HMAC-SHA256)>`.
// The signing secret is `WIDGET_TOKEN_SECRET` (env); rotating it invalidates
// every live widget token. All crypto is Web Crypto (available on Workers).
//
// Distinct from the machine API keys in `api-keys-crypto.ts`: those are random,
// long-lived, and stored hashed; these are self-describing, signed, and ephemeral.

const TOKEN_PREFIX = "inspktw_";

/** Claims embedded in (and recovered from) a widget token. */
export interface WidgetTokenClaims {
  /** Organization the token acts for. */
  orgId: string;
  /** App role this token authenticates as — always "manager" today. */
  role: string;
  /** The user who minted the token, for attribution. */
  userId: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

/** Constant-time comparison of two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Is this string shaped like a widget token? Cheap pre-check before verifying. */
export function hasWidgetTokenFormat(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX) && token.slice(TOKEN_PREFIX.length).includes(".");
}

/**
 * Mint a signed widget token valid for `ttlSeconds` from `nowSeconds`.
 * `nowSeconds` is injectable for deterministic tests; defaults to wall clock.
 */
export async function mintWidgetToken(
  secret: string,
  args: {
    orgId: string;
    role: string;
    userId: string;
    ttlSeconds: number;
    nowSeconds?: number;
  },
): Promise<{ token: string; exp: number }> {
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = now + args.ttlSeconds;
  const claims: WidgetTokenClaims = {
    orgId: args.orgId,
    role: args.role,
    userId: args.userId,
    exp,
  };
  const payload = base64urlEncode(enc.encode(JSON.stringify(claims)));
  const sig = base64urlEncode(await hmac(secret, payload));
  return { token: `${TOKEN_PREFIX}${payload}.${sig}`, exp };
}

/**
 * Verify a widget token's signature and expiry; return its claims or null.
 * `nowSeconds` is injectable for deterministic tests; defaults to wall clock.
 * Never throws on malformed input.
 */
export async function verifyWidgetToken(
  secret: string,
  token: string,
  nowSeconds?: number,
): Promise<WidgetTokenClaims | null> {
  if (!hasWidgetTokenFormat(token)) return null;
  const body = token.slice(TOKEN_PREFIX.length);
  const dot = body.indexOf(".");
  if (dot <= 0) return null;
  const payload = body.slice(0, dot);
  const sig = body.slice(dot + 1);

  let expected: Uint8Array;
  try {
    expected = await hmac(secret, payload);
  } catch {
    return null;
  }
  let provided: Uint8Array;
  try {
    provided = base64urlDecode(sig);
  } catch {
    return null;
  }
  if (!timingSafeEqual(provided, expected)) return null;

  let claims: WidgetTokenClaims;
  try {
    claims = JSON.parse(dec.decode(base64urlDecode(payload))) as WidgetTokenClaims;
  } catch {
    return null;
  }
  if (
    typeof claims?.orgId !== "string" ||
    typeof claims?.role !== "string" ||
    typeof claims?.userId !== "string" ||
    typeof claims?.exp !== "number"
  ) {
    return null;
  }
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.exp <= now) return null;

  return claims;
}
