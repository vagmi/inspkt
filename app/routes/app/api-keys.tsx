import { useEffect, useState } from "react";
import { redirect, useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { actorFromRole, can, landingPath } from "~/lib/capabilities";
import { apiFetch } from "~/lib/api-client.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/api-keys";

export function meta() {
  return [{ title: "API keys — inspkt" }];
}

/** The non-secret shape returned by GET /api/api-keys. */
interface ApiKeyEntry {
  id: string;
  name: string;
  prefix: string;
  createdByUserId: string;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

export async function loader({ request }: Route.LoaderArgs) {
  // Admin-only — managing machine credentials is a privileged action.
  const me = await apiFetch<{ role: string }>(request, "/api/me");
  const actor = actorFromRole(me.role);
  if (!can.manageApiKeys(actor)) throw redirect(landingPath(actor));

  const { keys } = await apiFetch<{ keys: ApiKeyEntry[] }>(
    request,
    "/api/api-keys",
  );
  return { keys };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "revoke") {
    await apiFetch(request, `/api/api-keys/${form.get("id")}`, {
      method: "DELETE",
    });
    return { ok: true as const };
  }

  // create — returns the plaintext token exactly once.
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { ok: false as const, error: "Give the key a name." };

  const res = await apiFetch<{ apiKey: ApiKeyEntry; token: string }>(
    request,
    "/api/api-keys",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  return { ok: true as const, token: res.token, name };
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function fmt(ts: number | null): string {
  return ts ? dateFormat.format(new Date(ts * 1000)) : "—";
}

function NewKeyDialog() {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const busy = fetcher.state !== "idle";
  // The token is only present in the response of a successful create.
  const token =
    fetcher.data && "token" in fetcher.data ? fetcher.data.token : undefined;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === false) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  function close() {
    setOpen(false);
    // Reset reveal state on the next open.
    setCopied(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <Button onClick={() => setOpen(true)}>New key</Button>
      <DialogContent>
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your API key now</DialogTitle>
              <DialogDescription>
                This is the only time the full key is shown. Store it somewhere
                safe — we only keep a hash and can't show it again.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted/50 flex items-start gap-2 rounded-md border p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">
                {token}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  navigator.clipboard?.writeText(token);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>
                Grants headless access to manage this org's clients, equipment,
                types, and forms. Acts as a manager — it can't manage members,
                roles, billing, or the org.
              </DialogDescription>
            </DialogHeader>
            <fetcher.Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="create" />
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="CI import job"
                  autoFocus
                  required
                  className="mt-1.5"
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy ? "Creating…" : "Create key"}
                </Button>
              </DialogFooter>
            </fetcher.Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KeyRow({ k }: { k: ApiKeyEntry }) {
  const fetcher = useFetcher();
  const revoking = fetcher.state !== "idle";
  const revoked = k.revokedAt != null;
  return (
    <div
      className={cn(
        "bg-card flex items-center justify-between gap-4 rounded-lg border p-4 transition-opacity",
        (revoking || revoked) && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-base">{k.name}</span>
          {revoked && <Badge variant="secondary">revoked</Badge>}
        </div>
        <p className="form-label-mono text-muted-foreground/70 mt-1 text-[10px]">
          <span className="font-mono">{k.prefix}…</span> · created{" "}
          {fmt(k.createdAt)} · last used {fmt(k.lastUsedAt)}
        </p>
      </div>
      {!revoked && (
        <fetcher.Form
          method="post"
          onSubmit={(e) => {
            if (!confirm(`Revoke "${k.name}"? This cannot be undone.`))
              e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="revoke" />
          <input type="hidden" name="id" value={k.id} />
          <button
            type="submit"
            disabled={revoking}
            className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] transition-colors"
          >
            {revoking ? "Revoking…" : "Revoke"}
          </button>
        </fetcher.Form>
      )}
    </div>
  );
}

export default function ApiKeys({ loaderData }: Route.ComponentProps) {
  const { keys } = loaderData;
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">Setup</p>
          <h1 className="mt-2 text-3xl">API keys</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Machine credentials for headless access to the write API. Send as{" "}
            <code className="font-mono text-xs">
              Authorization: Bearer inspkt_…
            </code>
          </p>
        </div>
        <NewKeyDialog />
      </div>

      <div className="rule-perforated mt-6" />

      {keys.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <span className="stamp -rotate-3">No keys yet</span>
          <h2 className="text-2xl">Create a key to script your setup.</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            A key can create and update clients, equipment, types, and forms via
            the API — shown once at creation, then stored only as a hash.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {keys.map((k) => (
            <KeyRow key={k.id} k={k} />
          ))}
        </div>
      )}
    </div>
  );
}
