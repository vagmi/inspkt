import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  NotFoundError,
  PlanLimitError,
  UsageLimitError,
  ValidationError,
} from "../services/errors";
import type { ApiEnv } from "../types";

/** Map typed domain errors thrown by services to HTTP responses.
 * Registered via app.onError in createApi (and in controller tests). */
export function domainErrorHandler(err: Error, c: Context<ApiEnv>) {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  if (err instanceof NotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof PlanLimitError) {
    return c.json({ error: err.message, code: "plan_limit" }, 402);
  }
  if (err instanceof UsageLimitError) {
    return c.json({ error: err.message, code: "usage_limit" }, 429);
  }
  if (err instanceof ValidationError) {
    return c.json({ error: err.message, details: err.details }, 422);
  }
  console.error("unhandled API error", err);
  return c.json({ error: "internal error" }, 500);
}
