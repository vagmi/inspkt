import { OrganizationSwitcher, UserButton } from "@clerk/react-router";
import { getAuth } from "@clerk/react-router/server";
import { Link, NavLink, Outlet, redirect } from "react-router";
import { Toaster } from "~/components/ui/sonner";
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
  return null;
}

function Wordmark() {
  return (
    <Link
      to="/app"
      className="font-heading text-lg font-semibold tracking-tight"
    >
      Mudhal<span className="text-stamp">*</span>
    </Link>
  );
}

const NAV = [
  { to: "/app", label: "Items", end: true },
  { to: "/app/members", label: "Members", end: false },
] as const;

export default function AppLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
          <Wordmark />
          <nav className="form-label-mono flex items-center gap-6">
            {NAV.map((item) => (
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
