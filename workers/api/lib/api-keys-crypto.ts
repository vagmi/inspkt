// API-key token primitives. The token is a high-entropy random string the
// caller sends as `Authorization: Bearer <token>`; we never store it, only its
// peppered HMAC hash. All crypto uses Web Crypto (available on Workers).

const TOKEN_PREFIX = "inspkt_";
/** 32 random bytes → 64 hex chars of secret. */
const SECRET_BYTES = 32;
/** Hex chars kept (after the prefix) for the non-secret display fragment. */
const DISPLAY_HEX = 8;

const TOKEN_RE = new RegExp(`^${TOKEN_PREFIX}[0-9a-f]{${SECRET_BYTES * 2}}$`);

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Is this string shaped like one of our tokens? Cheap pre-check before hashing. */
export function hasTokenFormat(token: string): boolean {
  return TOKEN_RE.test(token);
}

/** The non-secret display fragment for a token, e.g. "inspkt_a1b2c3d4". */
export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + DISPLAY_HEX);
}

/** Mint a new token. The full `token` is shown to the user exactly once; only
 * its hash is stored. `prefix` is kept for display ("which key is this"). */
export function generateToken(): { token: string; prefix: string } {
  const bytes = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(bytes);
  const token = `${TOKEN_PREFIX}${toHex(bytes)}`;
  return { token, prefix: tokenPrefix(token) };
}

/** Deterministic HMAC-SHA256(pepper, token), hex. Used both to store a new key
 * and to look one up on every request, so it must be stable for a given pepper. */
export async function hashToken(pepper: string, token: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  return toHex(new Uint8Array(sig));
}
