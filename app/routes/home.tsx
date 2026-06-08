import { useAuth } from "@clerk/react-router";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { PLANS, type PlanId } from "~/lib/plans";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Mudhal — an opinionated foundation for SaaS" },
    {
      name: "description",
      content:
        "A production-grade SaaS foundation: Clerk auth with organizations, Cloudflare D1 + Drizzle, and plan-based usage limits — built on solid engineering fundamentals.",
    },
  ];
}

function HeaderNav() {
  const { isSignedIn } = useAuth();
  return (
    <nav className="flex items-center gap-3">
      {isSignedIn ? (
        <Button asChild>
          <Link to="/app">Dashboard →</Link>
        </Button>
      ) : (
        <>
          <Button variant="ghost" asChild>
            <Link to="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/sign-up">Start free</Link>
          </Button>
        </>
      )}
    </nav>
  );
}

function Wordmark() {
  return (
    <span className="font-heading text-xl font-semibold tracking-tight">
      Mudhal<span className="text-stamp">*</span>
    </span>
  );
}

/** A static specimen of a dashboard — replace with a shot of your real app. */
function SpecimenSheet() {
  return (
    <div className="relative rotate-1 transition-transform duration-500 hover:rotate-0">
      <div className="rounded-lg border bg-card p-8 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.25)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="form-label-mono text-muted-foreground">
              Acme Inc · pro plan
            </p>
            <h3 className="mt-1 text-2xl">Items</h3>
          </div>
          <span
            className="stamp animate-stamp-in absolute -right-3 -top-3 bg-card"
            style={{ animationDelay: "0.9s" }}
          >
            Shipped
          </span>
        </div>

        <div className="mt-6 space-y-3">
          {["Onboarding flow", "Billing webhook", "Invite teammates"].map(
            (name, i) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2.5 text-sm"
              >
                <span>{name}</span>
                <span className="form-label-mono text-muted-foreground text-[10px]">
                  № {String(i + 1).padStart(3, "0")}
                </span>
              </div>
            ),
          )}
          <div className="flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            New item →
          </div>
        </div>

        <div className="rule-perforated mt-8" />
        <p className="form-label-mono mt-3 text-muted-foreground/70">
          Auth · Database · Plans — already wired
        </p>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    no: "01",
    title: "Auth & organizations",
    body: "Clerk handles sign-in, sign-up, and multi-tenant organizations. Every row in the database is scoped to the active org.",
  },
  {
    no: "02",
    title: "Database on the edge",
    body: "Cloudflare D1 + Drizzle ORM with a clean controller → service → repository layering and a migration workflow.",
  },
  {
    no: "03",
    title: "Plans & usage limits",
    body: "Plan-based gating and live usage metering are built in. Add Polar checkout, the customer portal, and webhooks with the billing-polar skill.",
  },
] as const;

const PLAN_COPY: Record<PlanId, { name: string; price: string }> = {
  free: { name: "Free", price: "$0" },
  pro: { name: "Pro", price: "$12/mo" },
  business: { name: "Business", price: "$49/mo" },
};

function PricingCard({ plan }: { plan: PlanId }) {
  const limits = PLANS[plan];
  const copy = PLAN_COPY[plan];
  return (
    <div
      className={cn(
        "bg-card rounded-lg border p-6",
        plan === "pro" && "border-stamp ring-stamp/25 ring-2",
      )}
    >
      <p className="form-label-mono text-muted-foreground">{copy.name}</p>
      <p className="mt-2 font-heading text-3xl">{copy.price}</p>
      <ul className="mt-4 space-y-1.5 text-sm">
        <li>{limits.maxItems.toLocaleString()} items</li>
        <li>{limits.apiCallsPerMonth.toLocaleString()} API calls/month</li>
        <li className={limits.webhooks ? "" : "text-muted-foreground/60"}>
          {limits.webhooks ? "Webhooks included" : "No webhooks"}
        </li>
      </ul>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark />
        <HeaderNav />
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* hero */}
        <section className="grid items-center gap-16 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
          <div>
            <p
              className="form-label-mono animate-fade-up text-stamp"
              style={{ animationDelay: "0.05s" }}
            >
              Auth · Database · Plans · Skills
            </p>
            <h1
              className="animate-fade-up mt-5 text-5xl leading-[1.05] md:text-7xl"
              style={{ animationDelay: "0.15s" }}
            >
              The foundation
              <br />
              your SaaS deserves.
            </h1>
            <p
              className="animate-fade-up mt-6 max-w-md text-lg text-muted-foreground"
              style={{ animationDelay: "0.3s" }}
            >
              Authentication, multi-tenancy, a typed data layer, and
              plan-based usage limits — architected with strong engineering
              fundamentals, ready for you to build on.
            </p>
            <div
              className="animate-fade-up mt-8 flex items-center gap-4"
              style={{ animationDelay: "0.45s" }}
            >
              <Button size="lg" asChild>
                <Link to="/sign-up">Start free</Link>
              </Button>
              <Button size="lg" variant="ghost" asChild>
                <Link to="/sign-in">Sign in →</Link>
              </Button>
            </div>
          </div>

          <div
            className="animate-fade-up hidden md:block"
            style={{ animationDelay: "0.5s" }}
          >
            <SpecimenSheet />
          </div>
        </section>

        <div className="rule-perforated" />

        {/* features */}
        <section className="grid gap-10 py-16 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.no}>
              <p className="form-label-mono text-stamp">{f.no}</p>
              <h2 className="mt-3 text-2xl">{f.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </section>

        <div className="rule-perforated" />

        {/* pricing */}
        <section className="mb-20 py-16">
          <h2 className="text-3xl">Plans</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Edit limits and prices in{" "}
            <code className="font-mono text-xs">app/lib/plans.ts</code>.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {(Object.keys(PLANS) as PlanId[]).map((plan) => (
              <PricingCard key={plan} plan={plan} />
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
          <Wordmark />
          <p className="form-label-mono text-muted-foreground">
            An opinionated foundation for SaaS
          </p>
        </div>
      </footer>
    </div>
  );
}
