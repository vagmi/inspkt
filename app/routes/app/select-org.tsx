import { CreateOrganization, OrganizationList } from "@clerk/react-router";
import { getAuth } from "@clerk/react-router/server";
import { redirect } from "react-router";
import type { Route } from "./+types/select-org";

export function meta() {
  return [{ title: "Choose an organization — Mudhal" }];
}

export async function loader(args: Route.LoaderArgs) {
  const auth = await getAuth(args);
  if (!auth.userId) throw redirect("/sign-in");
  if (auth.orgId) throw redirect("/app");
  return null;
}

export default function SelectOrg() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="text-center">
        <p className="form-label-mono text-stamp">Registration</p>
        <h1 className="mt-3 text-3xl">First, an organization.</h1>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          Everything in the app is scoped to an organization — pick one of
          yours or create a new one to continue.
        </p>
      </div>
      <OrganizationList
        hidePersonal
        afterSelectOrganizationUrl="/app"
        afterCreateOrganizationUrl="/app"
      />
      <noscript>
        <CreateOrganization afterCreateOrganizationUrl="/app" />
      </noscript>
    </div>
  );
}
