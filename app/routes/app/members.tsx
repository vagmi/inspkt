import { useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { actorFromRole, APP_ROLES, can } from "~/lib/capabilities";
import { ApiError, apiFetch } from "~/lib/api-client.server";
import type { MemberView } from "../../../workers/api/repositories/memberships-repo";
import type { Route } from "./+types/members";

export function meta() {
  return [{ title: "Members — inspkt" }];
}

export async function loader(args: Route.LoaderArgs) {
  // The actor is built from OUR app role (from /api/me), then run through the
  // SAME capability that gates the server route — so the UI can never show a
  // control the API would reject.
  const [me, membersRes] = await Promise.all([
    apiFetch<{ role: string; userId: string }>(args.request, "/api/me"),
    apiFetch<{ members: MemberView[] }>(args.request, "/api/members"),
  ]);
  const actor = actorFromRole(me.role);
  return {
    members: membersRes.members,
    canManageRoles: can.manageRoles(actor),
    canRemove: can.removeMember(actor),
    selfUserId: me.userId,
  };
}

export async function action(args: Route.ActionArgs) {
  const form = await args.request.formData();
  const intent = String(form.get("intent") ?? "");
  const userId = String(form.get("userId") ?? "");

  try {
    if (intent === "setRole") {
      await apiFetch(args.request, `/api/members/${userId}/role`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: String(form.get("role") ?? "") }),
      });
      return { ok: true, intent };
    }
    // remove
    await apiFetch(args.request, `/api/members/${userId}`, {
      method: "DELETE",
    });
    return { ok: true, intent };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 422 || e.status === 403)) {
      return { ok: false, error: e.body };
    }
    throw e;
  }
}

function fullName(m: MemberView): string {
  const name = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return name || m.email;
}

function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok && fetcher.data.intent === "setRole") {
        toast.success("Role updated");
      } else if (!fetcher.data.ok && fetcher.data.error) {
        // surface the last-admin guard / forbidden message
        try {
          toast.error(
            (JSON.parse(fetcher.data.error) as { error?: string }).error ??
              "Could not update role",
          );
        } catch {
          toast.error("Could not update role");
        }
      }
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Select
      value={role}
      disabled={busy}
      onValueChange={(next) => {
        if (next === role) return;
        fetcher.submit(
          { intent: "setRole", userId, role: next },
          { method: "post" },
        );
      }}
    >
      <SelectTrigger className="h-8 w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {APP_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RemoveButton({ userId }: { userId: string }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok && fetcher.data.intent === "delete") {
        toast.success("Member removed");
      } else if (!fetcher.data.ok && fetcher.data.error) {
        try {
          toast.error(
            (JSON.parse(fetcher.data.error) as { error?: string }).error ??
              "Could not remove member",
          );
        } catch {
          toast.error("Could not remove member");
        }
      }
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={busy}
        className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] transition-colors disabled:opacity-50"
      >
        {busy ? "Removing…" : "Remove"}
      </button>
    </fetcher.Form>
  );
}

export default function Members({ loaderData }: Route.ComponentProps) {
  const { members, canManageRoles, canRemove, selfUserId } = loaderData;

  return (
    <div>
      <p className="form-label-mono text-muted-foreground">
        {members.length} {members.length === 1 ? "member" : "members"}
      </p>
      <h1 className="mt-2 text-3xl">Members</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">
        Everyone in your active organization. Roles are managed in inspkt (not
        the identity provider): <strong>admin</strong> sets up and manages the
        team, <strong>manager</strong> oversees and assigns, and{" "}
        <strong>inspector</strong> performs assigned inspections. The same
        capability gates this page and the API.
      </p>

      <div className="rule-perforated mt-6" />

      <div className="mt-8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              {canRemove && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell className="font-medium">
                  {fullName(m)}
                  {m.userId === selfUserId && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.email}
                </TableCell>
                <TableCell>
                  {canManageRoles ? (
                    <RoleSelect userId={m.userId} role={m.role} />
                  ) : (
                    <span className="form-label-mono">{m.role}</span>
                  )}
                </TableCell>
                {canRemove && (
                  <TableCell className="text-right">
                    {m.userId !== selfUserId && (
                      <RemoveButton userId={m.userId} />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
