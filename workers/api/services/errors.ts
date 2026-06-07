// Typed domain errors thrown by services; controllers map them to HTTP.

export class NotFoundError extends Error {
  readonly kind = "not_found";
}

/** Plan ceiling reached (e.g. too many items) — maps to 402. */
export class PlanLimitError extends Error {
  readonly kind = "plan_limit";
}

/** Monthly metered quota exhausted — maps to 429. */
export class UsageLimitError extends Error {
  readonly kind = "usage_limit";
}

export class ValidationError extends Error {
  readonly kind = "validation";
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
