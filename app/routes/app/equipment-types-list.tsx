import { useEffect, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Link, redirect, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { DataTable } from "~/components/ui/data-table";
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
import { ApiError, apiFetch } from "~/lib/api-client.server";
import type { EquipmentTypeWithForms } from "../../../workers/api/repositories/equipment-types-repo";
import type { Route } from "./+types/equipment-types-list";

export function meta() {
  return [{ title: "Equipment types — inspkt" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await apiFetch<{ role: string }>(request, "/api/me");
  const actor = actorFromRole(me.role);
  if (!can.setup(actor)) throw redirect(landingPath(actor));

  const { types } = await apiFetch<{ types: EquipmentTypeWithForms[] }>(
    request,
    "/api/equipment-types",
  );
  return { types };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "delete") {
    try {
      await apiFetch(request, `/api/equipment-types/${form.get("id")}`, {
        method: "DELETE",
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        return { ok: false, error: e.body };
      }
      throw e;
    }
  }

  // create a bare type, then open its editor (name + forms + field schema)
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the type a name." };
  const res = await apiFetch<{ type: { id: string } }>(
    request,
    "/api/equipment-types",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, formIds: [], fields: [] }),
    },
  );
  throw redirect(`/app/equipment-types/${res.type.id}`);
}

function NewTypeDialog() {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const busy = fetcher.state !== "idle";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>New type</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New equipment type</DialogTitle>
          <DialogDescription>
            Name it — next you'll define its fields and attach inspection forms.
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" ref={ref} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Light Commercial Vehicle"
              autoFocus
              required
              className="mt-1.5"
            />
          </div>
          {fetcher.data && fetcher.data.ok === false && (
            <p className="text-destructive text-sm">{fetcher.data.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create & edit"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === false) {
      try {
        toast.error(
          (JSON.parse(fetcher.data.error ?? "{}") as { error?: string })
            .error ?? "Could not delete type",
        );
      } catch {
        toast.error("Could not delete type");
      }
    }
  }, [fetcher.state, fetcher.data]);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (!confirm(`Delete ${name}?`)) return;
        fetcher.submit(
          { intent: "delete", id },
          { method: "post" },
        );
      }}
      className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}

// Module-scope so the array is a stable reference. Defining columns inside the
// component makes a new array every render; TanStack Table then churns, and the
// useFetcher() in the DeleteButton cell turns that into an infinite render loop.
// (The cells only read `row.original`, so they need nothing from the closure.)
const columns: ColumnDef<EquipmentTypeWithForms>[] = [
  {
    accessorKey: "name",
    header: "Type",
    cell: ({ row }) => (
      <Link
        to={`/app/equipment-types/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    id: "fields",
    header: "Fields",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.fields.length}
      </span>
    ),
  },
  {
    id: "forms",
    header: "Forms",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.forms.length > 0
          ? row.original.forms.map((f) => f.name).join(", ")
          : "—"}
      </span>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="text-right">
        <DeleteButton id={row.original.id} name={row.original.name} />
      </div>
    ),
  },
];

export default function EquipmentTypesList({
  loaderData,
}: Route.ComponentProps) {
  const { types } = loaderData;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">Setup</p>
          <h1 className="mt-2 text-3xl">Equipment types</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The kinds of asset you inspect. Each defines the fields its equipment
            tracks and the forms used to inspect it.
          </p>
        </div>
        <NewTypeDialog />
      </div>

      <div className="rule-perforated mt-6" />

      <div className="mt-8">
        {types.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="stamp -rotate-3">No types yet</span>
            <h2 className="text-2xl">Define your first equipment type.</h2>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={types}
            filterColumn="name"
            filterPlaceholder="Search types…"
          />
        )}
      </div>
    </div>
  );
}
