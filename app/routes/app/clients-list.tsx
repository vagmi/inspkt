import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { redirect, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { actorFromRole, can, landingPath } from "~/lib/capabilities";
import { apiFetch } from "~/lib/api-client.server";
import type { Client } from "../../../workers/api/repositories/clients-repo";
import type { Route } from "./+types/clients-list";

export function meta() {
  return [{ title: "Clients — inspkt" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Setup data — inspectors don't manage clients; bounce them to their work.
  const me = await apiFetch<{ role: string }>(request, "/api/me");
  const actor = actorFromRole(me.role);
  if (!can.setup(actor)) throw redirect(landingPath(actor));

  const { clients } = await apiFetch<{ clients: Client[] }>(
    request,
    "/api/clients",
  );
  return { clients };
}

export async function action({ request }: Route.ActionArgs) {
  const body = (await request.json()) as {
    intent: "create" | "update" | "delete";
    id?: string;
    client?: Record<string, unknown>;
  };

  if (body.intent === "delete") {
    await apiFetch(request, `/api/clients/${body.id}`, { method: "DELETE" });
    return { ok: true };
  }

  const path =
    body.intent === "update" ? `/api/clients/${body.id}` : "/api/clients";
  const method = body.intent === "update" ? "PATCH" : "POST";
  await apiFetch(request, path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body.client ?? {}),
  });
  return { ok: true };
}

// Form schema — empty optional fields are allowed; the action strips blanks so
// the server sees `undefined`, not "".
const clientFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  contactName: z.string().max(200).optional(),
  contactEmail: z
    .string()
    .max(200)
    .email("Enter a valid email")
    .or(z.literal(""))
    .optional(),
  contactPhone: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
});
type ClientFormValues = z.infer<typeof clientFormSchema>;

function toDefaults(client?: Client): ClientFormValues {
  return {
    name: client?.name ?? "",
    contactName: client?.contactName ?? "",
    contactEmail: client?.contactEmail ?? "",
    contactPhone: client?.contactPhone ?? "",
    notes: client?.notes ?? "",
  };
}

/** Drop empty strings so optional fields serialize as absent, not "". */
function clean(values: ClientFormValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  }
  return out;
}

function ClientDialog({
  client,
  trigger,
}: {
  client?: Client;
  trigger: React.ReactNode;
}) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: toDefaults(client),
  });
  const busy = fetcher.state !== "idle";

  // Reset to current values whenever the dialog opens.
  useEffect(() => {
    if (open) form.reset(toDefaults(client));
  }, [open, client, form]);

  // Close on a successful submit (revalidation refreshes the table).
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && open) {
      setOpen(false);
      toast.success(client ? "Client updated" : "Client created");
    }
  }, [fetcher.state, fetcher.data, open, client]);

  function onSubmit(values: ClientFormValues) {
    const body = JSON.parse(
      JSON.stringify({
        intent: client ? "update" : "create",
        id: client?.id,
        client: clean(values),
      }),
    );
    fetcher.submit(body, { method: "post", encType: "application/json" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription>
            Clients are the customers you perform inspections for. Facilities
            belong to a client.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Properties" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact name</FormLabel>
                    <FormControl>
                      <Input placeholder="Dana Lee" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 555 0100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="contactEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="dana@acme.example"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Anything worth remembering" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : client ? "Save changes" : "Create client"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({ client }: { client: Client }) {
  const fetcher = useFetcher();
  const deleting = fetcher.state !== "idle";
  return (
    <div className="flex items-center justify-end gap-3">
      <ClientDialog
        client={client}
        trigger={
          <button
            type="button"
            className="form-label-mono text-muted-foreground/70 hover:text-foreground text-[10px]"
          >
            Edit
          </button>
        }
      />
      <button
        type="button"
        disabled={deleting}
        onClick={() => {
          if (!confirm(`Delete ${client.name}?`)) return;
          fetcher.submit(
            { intent: "delete", id: client.id },
            { method: "post", encType: "application/json" },
          );
        }}
        className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}

const columns: ColumnDef<Client>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    id: "contact",
    header: "Contact",
    cell: ({ row }) => {
      const c = row.original;
      const name = c.contactName ?? "—";
      return (
        <div>
          <div>{name}</div>
          {c.contactEmail && (
            <div className="text-muted-foreground text-xs">{c.contactEmail}</div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "contactPhone",
    header: "Phone",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.contactPhone ?? "—"}
      </span>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <RowActions client={row.original} />,
  },
];

export default function ClientsList({ loaderData }: Route.ComponentProps) {
  const { clients } = loaderData;
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">Setup</p>
          <h1 className="mt-2 text-3xl">Clients</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The customers you inspect for. Facilities belong to a client.
          </p>
        </div>
        <ClientDialog trigger={<Button>New client</Button>} />
      </div>

      <div className="rule-perforated mt-6" />

      <div className="mt-8">
        {clients.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="stamp -rotate-3">No clients yet</span>
            <h2 className="text-2xl">Onboard your first client.</h2>
            <p className="text-muted-foreground max-w-sm text-sm">
              Add the customers you perform inspections for — then register their
              facilities and equipment.
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={clients}
            filterColumn="name"
            filterPlaceholder="Search clients…"
          />
        )}
      </div>
    </div>
  );
}
