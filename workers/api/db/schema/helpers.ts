/** Unix timestamp in seconds — the convention for all D1 timestamps. */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}
