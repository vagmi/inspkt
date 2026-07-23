import { OrganizationSwitcher, UserButton } from "@clerk/react-router";
import { getAuth } from "@clerk/react-router/server";
import { Menu, MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, redirect } from "react-router";
import { SetupAssistant } from "~/components/setup-assistant";
import { Toaster } from "~/components/ui/sonner";
import { actorFromRole, can, type Actor } from "~/lib/capabilities";
import { apiFetch } from "~/lib/api-client.server";
import { getUraiConfig } from "~/lib/urai.server";
import { cn } from "~/lib/utils";
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
  const me = await apiFetch<{ role: string; orgId: string; userId: string }>(
    args.request,
    "/api/me",
  );
  // The setup assistant is a setup-only tool; mint its embed config (token +
  // Urai config) for admins/managers, when the widget is configured.
  const urai = can.setup(actorFromRole(me.role))
    ? await getUraiConfig({ orgId: me.orgId, userId: me.userId })
    : null;
  return { role: me.role, urai };
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

// Each nav item declares the capability that reveals it, so the nav is the
// "mode": inspectors see only their work; managers/admins see setup too.
const NAV = [
  { to: "/app/inspections", label: "Inspections", end: false, show: can.inspect },
  { to: "/app", label: "Clients", end: true, show: can.setup },
  { to: "/app/equipment-types", label: "Types", end: false, show: can.setup },
  { to: "/app/forms", label: "Forms", end: false, show: can.setup },
  { to: "/app/members", label: "Members", end: false, show: can.viewMembers },
  { to: "/app/api-keys", label: "API keys", end: false, show: can.manageApiKeys },
] as const satisfies ReadonlyArray<{
  to: string;
  label: string;
  end: boolean;
  show: (a: Actor) => boolean;
}>;

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? "text-stamp underline decoration-dashed underline-offset-8"
    : "text-muted-foreground transition-colors hover:text-foreground";
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const actor = actorFromRole(loaderData.role);
  const nav = NAV.filter((item) => item.show(actor));
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const hasAssistant = Boolean(loaderData.urai);

  return (
    <>
      {/* The app shell is full-width/fluid; when the assistant is open it
          reserves space on the right (sm+) so content shifts left instead of
          being covered. The reserved margin must match the panel width. */}
      <div
        className={cn(
          "min-h-screen transition-[margin] duration-300",
          hasAssistant && assistantOpen && "sm:mr-[380px]",
        )}
      >
        <header className="border-b bg-card/60">
          <div className="flex h-14 items-center gap-4 px-4 sm:px-6 lg:gap-8">
            {/* Hamburger — small screens only */}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              className="text-muted-foreground hover:text-foreground -ml-1 lg:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>

            <Wordmark />

            {/* Inline nav — large screens only */}
            <nav className="form-label-mono hidden items-center gap-6 lg:flex">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={navLinkClass}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3 sm:gap-4">
              {hasAssistant && (
                <button
                  type="button"
                  onClick={() => setAssistantOpen((o) => !o)}
                  aria-pressed={assistantOpen}
                  className={cn(
                    "form-label-mono flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-white shadow-sm transition-colors",
                    assistantOpen
                      ? "border-stamp bg-stamp hover:bg-stamp/90"
                      : "border-neutral-900 bg-neutral-900 hover:bg-neutral-800",
                  )}
                >
                  <MessageCircle className="size-4" />
                  <span className="hidden sm:inline">Ask AI</span>
                </button>
              )}
              <div className="hidden sm:block">
                <OrganizationSwitcher
                  hidePersonal
                  afterCreateOrganizationUrl="/app"
                  afterSelectOrganizationUrl="/app"
                />
              </div>
              <UserButton />
            </div>
          </div>

          {/* Collapsible nav panel — small screens only */}
          <div className={cn("border-t lg:hidden", menuOpen ? "block" : "hidden")}>
            <nav className="form-label-mono flex flex-col gap-1 px-4 py-3">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={(state) => cn(navLinkClass(state), "py-1.5")}
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="mt-2 border-t pt-3 sm:hidden">
                <OrganizationSwitcher
                  hidePersonal
                  afterCreateOrganizationUrl="/app"
                  afterSelectOrganizationUrl="/app"
                />
              </div>
            </nav>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 sm:py-10">
          <Outlet />
        </main>
      </div>
      {loaderData.urai && (
        <SetupAssistant
          config={loaderData.urai}
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
        />
      )}
      <Toaster position="bottom-right" />
    </>
  );
}
