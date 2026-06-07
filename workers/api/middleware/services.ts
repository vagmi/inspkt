import { createMiddleware } from "hono/factory";
import { createServices } from "../services";
import type { ApiEnv } from "../types";

/** Build the per-request service container from env bindings.
 * Respects a container that's already set (tests inject mocks upstream). */
export const injectServices = createMiddleware<ApiEnv>(async (c, next) => {
  if (!c.var.services) {
    c.set("services", createServices(c.env));
  }
  await next();
});
