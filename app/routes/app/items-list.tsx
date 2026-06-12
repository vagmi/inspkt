import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
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
import { Textarea } from "~/components/ui/textarea";
import { ApiError, apiFetch } from "~/lib/api-client.server";
import { cn } from "~/lib/utils";
import type { Item } from "../../../workers/api/repositories/items-repo";
import type { Organization } from "../../../workers/api/repositories/organizations-repo";
import type { User } from "../../../workers/api/repositories/users-repo";
import type { Route } from "./+types/items-list";

export function meta() {
  return [{ title: "Items — inspkt" }];
}

// The dashboard talks to the Hono API in-process (apiFetch) — same code path
// as a real network client, so loaders/actions stay thin. This whole file is
// the copy-me example for a CRUD resource: list (loader) + create/delete
// (action), rendered with a dialog and per-row forms.
export async function loader({ request }: Route.LoaderArgs) {
  const [me, itemsRes] = await Promise.all([
    apiFetch<{ org: Organization; user: User; orgRole: string | null }>(
      request,
      "/api/me",
    ),
    apiFetch<{ items: Item[] }>(request, "/api/items"),
  ]);
  return {
    org: me.org,
    user: me.user,
    orgRole: me.orgRole,
    items: itemsRes.items,
  };
}

function displayName(user: User): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email
  );
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "delete") {
    await apiFetch(request, `/api/items/${form.get("id")}`, {
      method: "DELETE",
    });
    return { ok: true };
  }

  // create
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const category = String(form.get("category") ?? "").trim();
  const locationLabel = String(form.get("locationLabel") ?? "").trim();
  const lat = Number.parseFloat(String(form.get("locationLat") ?? ""));
  const lng = Number.parseFloat(String(form.get("locationLng") ?? ""));
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  if (!name) return { ok: false, error: "Give your item a name." };

  try {
    await apiFetch(request, "/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        category: category || undefined,
        locationLabel: locationLabel || undefined,
        locationLat: hasCoords ? lat : undefined,
        locationLng: hasCoords ? lng : undefined,
      }),
    });
    return { ok: true, created: true };
  } catch (e) {
    if (e instanceof ApiError && e.status === 402) {
      return {
        ok: false,
        error: "You've hit your plan's item limit — upgrade to add more.",
      };
    }
    throw e;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function ItemCard({ item, index }: { item: Item; index: number }) {
  const fetcher = useFetcher();
  const deleting = fetcher.state !== "idle";
  return (
    <div
      className={cn(
        "bg-card rounded-lg border p-5 transition-opacity",
        deleting && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="form-label-mono text-muted-foreground">
          Item № {String(index + 1).padStart(3, "0")}
        </p>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            disabled={deleting}
            className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] transition-colors"
          >
            Delete
          </button>
        </fetcher.Form>
      </div>
      <h2 className="mt-2 truncate text-xl">{item.name}</h2>
      {item.category && (
        <p className="form-label-mono text-muted-foreground mt-1 text-[10px] uppercase">
          {item.category}
        </p>
      )}
      {item.description && (
        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
          {item.description}
        </p>
      )}
      <div className="rule-perforated mt-4" />
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="form-label-mono text-muted-foreground/70 text-[10px]">
          {dateFormat.format(new Date(item.updatedAt * 1000))}
        </p>
        {(item.locationLabel || item.locationLat != null) && (
          <p
            className="form-label-mono text-muted-foreground/70 truncate text-[10px]"
            title={
              item.locationLat != null
                ? `${item.locationLat.toFixed(5)}, ${item.locationLng?.toFixed(5)}`
                : undefined
            }
          >
            ⌖{" "}
            {item.locationLabel ??
              `${item.locationLat?.toFixed(3)}, ${item.locationLng?.toFixed(3)}`}
          </p>
        )}
      </div>
    </div>
  );
}

function NewItemDialog() {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const busy = fetcher.state !== "idle";
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locating, setLocating] = useState(false);

  // Close + reset on a successful create; surface a toast.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.created) {
      setOpen(false);
      formRef.current?.reset();
      setCoords(null);
      toast.success("Item created");
    }
  }, [fetcher.state, fetcher.data]);

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        toast.error("Couldn't get your location");
        setLocating(false);
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>New item</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New item</DialogTitle>
          <DialogDescription>
            Items are scoped to your active organization.
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" ref={formRef} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Rooftop HVAC unit #3"
              autoFocus
              required
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              name="category"
              placeholder="HVAC, vehicle, unit…"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="What is this item?"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="locationLabel">Location</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="locationLabel"
                name="locationLabel"
                placeholder="Building A roof, bay 3"
              />
              <Button
                type="button"
                variant="outline"
                onClick={captureLocation}
                disabled={locating}
              >
                {locating ? "Locating…" : coords ? "⌖ Captured" : "⌖ Locate"}
              </Button>
            </div>
            {coords && (
              <p className="text-muted-foreground mt-1 font-mono text-xs">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            )}
            <input
              type="hidden"
              name="locationLat"
              value={coords?.lat ?? ""}
            />
            <input
              type="hidden"
              name="locationLng"
              value={coords?.lng ?? ""}
            />
          </div>
          {fetcher.data?.error && (
            <p className="text-destructive text-sm">{fetcher.data.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create item"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ItemsList({ loaderData }: Route.ComponentProps) {
  const { org, user, orgRole, items } = loaderData;
  const role = (orgRole ?? "org:member").replace(/^org:/, "");
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">
            {org.name} · {org.plan} plan
          </p>
          <h1 className="mt-2 text-3xl">Items</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Signed in as{" "}
            <span className="text-foreground">{displayName(user)}</span> ·{" "}
            <span className="font-mono text-xs">{role}</span> of {org.name}
          </p>
        </div>
        <NewItemDialog />
      </div>

      <div className="rule-perforated mt-6" />

      {items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <span className="stamp -rotate-3">Nothing here yet</span>
          <h2 className="text-2xl">Your first item is one click away.</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            This list is the example resource. Rename it, copy it, and build
            the thing your app is actually about.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <ItemCard key={item.id} item={item} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
