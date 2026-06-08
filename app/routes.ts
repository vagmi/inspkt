import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sign-in/*", "routes/sign-in.tsx"),
  route("sign-up/*", "routes/sign-up.tsx"),

  // No-org state lives OUTSIDE the dashboard layout so dashboard child
  // loaders (which 403 without an active org) never run.
  route("app/select-org", "routes/app/select-org.tsx"),

  // Org-scoped dashboard. Add your own resource routes alongside `items`.
  route("app", "routes/app/layout.tsx", [
    index("routes/app/items-list.tsx"),
    route("members", "routes/app/members.tsx"),
  ]),
] satisfies RouteConfig;
