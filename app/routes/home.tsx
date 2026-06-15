import { useAuth } from "@clerk/react-router";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { PLANS, type PlanId } from "~/lib/plans";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "inspkt · inspections, scored and shipped" },
    {
      name: "description",
      content:
        "A multi-tenant inspection platform. Build reusable forms, register clients, facilities, and equipment, assign inspectors, and turn every submission into a pass, conditional, or fail verdict.",
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
      inspkt<span className="text-stamp">*</span>
    </span>
  );
}

/** A static specimen of an inspection report — replace with a shot of your real app. */
function SpecimenSheet() {
  const checkpoints = [
    { name: "Pressure relief valve", result: "Pass" },
    { name: "Corrosion on housing", result: "Conditional" },
    { name: "Emergency shut-off", result: "Pass" },
  ] as const;
  return (
    <div className="relative rotate-1 transition-transform duration-500 hover:rotate-0">
      <div className="rounded-lg border bg-card p-8 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.25)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="form-label-mono text-muted-foreground">
              Boiler #4 · Acme Refinery
            </p>
            <h3 className="mt-1 text-2xl">Annual safety inspection</h3>
          </div>
          <span
            className="stamp animate-stamp-in absolute -right-3 -top-3 bg-card"
            style={{ animationDelay: "0.9s" }}
          >
            Conditional
          </span>
        </div>

        <div className="mt-6 space-y-3">
          {checkpoints.map((c, i) => (
            <div
              key={c.name}
              className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2.5 text-sm"
            >
              <span>{c.name}</span>
              <span
                className={cn(
                  "form-label-mono text-[10px]",
                  c.result === "Pass"
                    ? "text-muted-foreground"
                    : "text-stamp",
                )}
              >
                {c.result}
              </span>
            </div>
          ))}
          <div className="flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Re-inspection due in 30 days →
          </div>
        </div>

        <div className="rule-perforated mt-8" />
        <p className="form-label-mono mt-3 text-muted-foreground/70">
          Scored · geo-tagged · photo-backed
        </p>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    no: "01",
    title: "Custom forms",
    body: "Build reusable rubrics with sectioned checkpoints, answer types, severity, critical flags, and photo requirements. Attach each form to an equipment type.",
  },
  {
    no: "02",
    title: "Asset hierarchy",
    body: "Manage clients, facilities, and the equipment inside them, plus mobile equipment with no fixed site. Define custom fields per equipment type, validated on the way in.",
  },
  {
    no: "03",
    title: "Scored verdicts",
    body: "Every submitted inspection is scored into a pass, conditional, or fail verdict with corrective actions and re-inspection scheduling. Captured with photos and geo-tags.",
  },
] as const;

const PLAN_COPY: Record<PlanId, { name: string; price: string }> = {
  free: { name: "Free", price: "$0" },
  pro: { name: "Pro", price: "$50/mo" },
  business: { name: "Business", price: "$250/mo" },
};

/** Renders a count or "Unlimited" for the no-ceiling sentinel. */
function limitText(n: number, noun: string) {
  return Number.isFinite(n) ? `${n.toLocaleString()} ${noun}` : `Unlimited ${noun}`;
}

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
        <li>{limits.maxUsers.toLocaleString()} {limits.maxUsers === 1 ? "user" : "users"}</li>
        <li>{limitText(limits.maxFacilities, "facilities")}</li>
        <li>{limitText(limits.maxInspectionsPerMonth, "inspections/month")}</li>
        <li>
          {limits.dataRetentionDays === null
            ? "Unlimited data retention"
            : `${limits.dataRetentionDays}-day data retention`}
        </li>
      </ul>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-5">
        <Wordmark />
        <HeaderNav />
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* hero */}
        <section className="grid items-center gap-16 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
          <div>
            <p
              className="form-label-mono animate-fade-up text-stamp"
              style={{ animationDelay: "0.05s" }}
            >
              Forms · Equipment · Inspections · Verdicts
            </p>
            <h1
              className="animate-fade-up mt-5 text-5xl leading-[1.05] md:text-7xl"
              style={{ animationDelay: "0.15s" }}
            >
              Inspections,
              <br />
              scored and shipped.
            </h1>
            <p
              className="animate-fade-up mt-6 max-w-md text-lg text-muted-foreground"
              style={{ animationDelay: "0.3s" }}
            >
              Build reusable forms, register your clients' facilities and
              equipment, and assign inspectors. Every inspection comes back as
              a pass, conditional, or fail verdict with photos, corrections,
              and re-inspection dates.
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
            Start free, upgrade as you onboard more facilities. No card to
            begin.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {(Object.keys(PLANS) as PlanId[]).map((plan) => (
              <PricingCard key={plan} plan={plan} />
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-8">
          <Wordmark />
          <p className="form-label-mono text-muted-foreground">
            Inspections, scored and shipped
          </p>
        </div>
      </footer>
    </div>
  );
}
