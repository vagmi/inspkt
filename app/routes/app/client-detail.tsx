import { Link, redirect } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { actorFromRole, can, landingPath } from "~/lib/capabilities";
import { apiFetch } from "~/lib/api-client.server";
import type { Client } from "../../../workers/api/repositories/clients-repo";
import type { EquipmentListRow } from "../../../workers/api/repositories/equipment-repo";
import type { FacilityListRow } from "../../../workers/api/repositories/facilities-repo";
import type { Route } from "./+types/client-detail";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.client.name ?? "Client"} — inspkt` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await apiFetch<{ role: string }>(request, "/api/me");
  const actor = actorFromRole(me.role);
  if (!can.setup(actor)) throw redirect(landingPath(actor));

  const [clientRes, facilitiesRes, equipmentRes] = await Promise.all([
    apiFetch<{ client: Client }>(request, `/api/clients/${params.clientId}`),
    apiFetch<{ facilities: FacilityListRow[] }>(
      request,
      `/api/facilities?clientId=${params.clientId}`,
    ),
    apiFetch<{ equipment: EquipmentListRow[] }>(
      request,
      `/api/equipment?clientId=${params.clientId}`,
    ),
  ]);
  return {
    client: clientRes.client,
    facilities: facilitiesRes.facilities,
    equipment: equipmentRes.equipment,
  };
}

function FacilityCard({
  facility,
  equipment,
}: {
  facility: FacilityListRow;
  equipment: EquipmentListRow[];
}) {
  const location =
    facility.locationLabel ??
    (facility.locationLat != null
      ? `${facility.locationLat.toFixed(3)}, ${facility.locationLng?.toFixed(3)}`
      : null);

  return (
    <div className="bg-card rounded-lg border p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-lg">{facility.name}</h3>
          {facility.category && (
            <p className="form-label-mono text-muted-foreground/70 text-[10px] uppercase">
              {facility.category}
            </p>
          )}
        </div>
        {location && (
          <p className="form-label-mono text-muted-foreground/70 text-[10px]">
            ⌖ {location}
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="form-label-mono text-muted-foreground mb-2 text-[10px]">
          {equipment.length} equipment
        </p>
        <EquipmentList
          equipment={equipment}
          empty="No equipment registered here yet."
        />
      </div>
    </div>
  );
}

function EquipmentList({
  equipment,
  empty,
}: {
  equipment: EquipmentListRow[];
  empty: string;
}) {
  if (equipment.length === 0)
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="divide-y rounded-md border">
      {equipment.map((e) => (
        <li
          key={e.id}
          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
        >
          <span className="min-w-0 truncate">
            {e.name}
            {e.identifier && (
              <span className="text-muted-foreground/70 ml-2 font-mono text-xs">
                {e.identifier}
              </span>
            )}
          </span>
          {e.typeName && (
            <Badge variant="secondary" className="shrink-0">
              {e.typeName}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ClientDetail({ loaderData }: Route.ComponentProps) {
  const { client, facilities, equipment } = loaderData;

  // Group equipment under its facility; mobile assets (no facility) are listed
  // separately.
  const byFacility = new Map<string, EquipmentListRow[]>();
  const mobile: EquipmentListRow[] = [];
  for (const e of equipment) {
    if (!e.facilityId) {
      mobile.push(e);
      continue;
    }
    const list = byFacility.get(e.facilityId) ?? [];
    list.push(e);
    byFacility.set(e.facilityId, list);
  }

  const contactBits = [
    client.contactName,
    client.contactEmail,
    client.contactPhone,
  ].filter(Boolean);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="form-label-mono text-muted-foreground">
            <Link to="/app/clients" className="hover:text-foreground">
              Clients
            </Link>{" "}
            / {client.name}
          </p>
          <h1 className="mt-2 text-3xl">{client.name}</h1>
          {contactBits.length > 0 && (
            <p className="text-muted-foreground mt-1 text-sm">
              {contactBits.join(" · ")}
            </p>
          )}
          <p className="text-muted-foreground mt-1 text-sm">
            {facilities.length}{" "}
            {facilities.length === 1 ? "facility" : "facilities"} ·{" "}
            {equipment.length} equipment
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/app">Manage facilities</Link>
        </Button>
      </div>

      {client.notes && (
        <p className="text-muted-foreground bg-muted/40 mt-4 rounded-md border p-3 text-sm">
          {client.notes}
        </p>
      )}

      <div className="rule-perforated mt-6" />

      {facilities.length === 0 && mobile.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <span className="stamp -rotate-3">Nothing yet</span>
          <h2 className="text-2xl">No facilities or equipment.</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            Add facilities for {client.name} on the{" "}
            <Link to="/app" className="underline">
              Facilities
            </Link>{" "}
            page, or register equipment on the{" "}
            <Link to="/app/equipment" className="underline">
              Equipment
            </Link>{" "}
            page.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {facilities.map((f) => (
            <FacilityCard
              key={f.id}
              facility={f}
              equipment={byFacility.get(f.id) ?? []}
            />
          ))}
          {mobile.length > 0 && (
            <div className="bg-card rounded-lg border border-dashed p-5">
              <h3 className="text-lg">Mobile equipment</h3>
              <p className="form-label-mono text-muted-foreground/70 text-[10px]">
                Not tied to a facility
              </p>
              <div className="mt-4">
                <EquipmentList equipment={mobile} empty="" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
