import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sign-in/*", "routes/sign-in.tsx"),
  route("sign-up/*", "routes/sign-up.tsx"),

  // No-org state lives OUTSIDE the dashboard layout so dashboard child
  // loaders (which 403 without an active org) never run.
  route("app/select-org", "routes/app/select-org.tsx"),

  // Resource route: mints short-lived widget tokens for the setup assistant.
  // Standalone (no UI) so it doesn't inherit the dashboard layout.
  route("app/urai-token", "routes/app/urai-token.ts"),

  // Org-scoped dashboard. Add your own resource routes alongside `items`.
  route("app", "routes/app/layout.tsx", [
    index("routes/app/clients-list.tsx"),
    route("clients/:clientId", "routes/app/client-detail.tsx"),
    route("equipment-types", "routes/app/equipment-types-list.tsx"),
    route("equipment-types/:typeId", "routes/app/equipment-types-edit.tsx"),
    route("forms", "routes/app/forms-list.tsx"),
    route("forms/:formId", "routes/app/forms-edit.tsx"),
    route("inspections", "routes/app/inspections-list.tsx"),
    route("inspections/:inspectionId", "routes/app/inspection-capture.tsx"),
    route("members", "routes/app/members.tsx"),
    route("api-keys", "routes/app/api-keys.tsx"),
  ]),
] satisfies RouteConfig;
