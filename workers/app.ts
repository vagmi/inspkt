import { createRequestHandler } from "react-router";
import { api } from "./api/instance";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // /api/* → Hono (controllers → services → repositories)
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }

    // Everything else → React Router SSR (dashboard, marketing)
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
