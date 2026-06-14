import { OrganizationSwitcher, UserButton } from "@clerk/react-router";
import { getAuth } from "@clerk/react-router/server";
import { Link, NavLink, Outlet, redirect } from "react-router";
import { Toaster } from "~/components/ui/sonner";
import { actorFromRole, can } from "~/lib/capabilities";
import { apiFetch } from "~/lib/api-client.server";
import type { Route } from "./+types/layout";

export async function loader(args: Route.LoaderArgs) {
  const auth = await getAuth(args);
  if (!auth.userId) {
    throw redirect("/sign-in");
  }
  // Child loaders 403 without an active org — bounce before they run.
  if (!auth.orgId) {
    throw redirect("/app/select-org");
  }
  // The app role drives which nav (mode) this member sees.
  const me = await apiFetch<{ role: string }>(args.request, "/api/me");
  return { role: me.role };
}

function Wordmark() {
  return (
    <Link
      to="/app"
      className="font-heading text-lg font-semibold tracking-tight"
    >
      inspkt<span className="text-stamp">*</span>
    </Link>
  );
}

import type { Actor } from "~/lib/capabilities";

// Each nav item declares the capability that reveals it, so the nav is the
// "mode": inspectors see only their work; managers/admins see setup too.
const NAV = [
  { to: "/app/inspections", label: "Inspections", end: false, show: can.inspect },
  { to: "/app", label: "Items", end: true, show: can.setup },
  { to: "/app/forms", label: "Forms", end: false, show: can.setup },
  { to: "/app/members", label: "Members", end: false, show: can.viewMembers },
] as const satisfies ReadonlyArray<{
  to: string;
  label: string;
  end: boolean;
  show: (a: Actor) => boolean;
}>;

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const actor = actorFromRole(loaderData.role);
  const nav = NAV.filter((item) => item.show(actor));
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
          <Wordmark />
          <nav className="form-label-mono flex items-center gap-6">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive
                    ? "text-stamp underline decoration-dashed underline-offset-8"
                    : "text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <OrganizationSwitcher
              hidePersonal
              afterCreateOrganizationUrl="/app"
              afterSelectOrganizationUrl="/app"
            />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}
