import { and, desc, eq } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { facilities, forms, inspections, observations } from "../db/schema";
import type { ObservationAnswer } from "../db/schema/inspections";
import { now } from "../db/schema/helpers";

export type Inspection = typeof inspections.$inferSelect;
export type Observation = typeof observations.$inferSelect;

export interface InspectionWithObservations extends Inspection {
  observations: Observation[];
}

/** A row for the list view: the inspection plus the names it points at. */
export interface InspectionListRow extends Inspection {
  facilityName: string | null;
  formName: string | null;
}

export interface InspectionCreate {
  orgId: string;
  facilityId: string;
  formId: string;
  inspectorUserId: string;
  capturedLat?: number | null;
  capturedLng?: number | null;
}

export interface ObservationInput {
  checkpointId: string;
  answer?: ObservationAnswer | null;
  note?: string | null;
  photoKeys?: string[] | null;
  capturedLat?: number | null;
  capturedLng?: number | null;
}

export function createInspectionsRepo(db: Db) {
  async function listObservations(
    orgId: string,
    inspectionId: string,
  ): Promise<Observation[]> {
    return db
      .select()
      .from(observations)
      .where(
        and(
          eq(observations.orgId, orgId),
          eq(observations.inspectionId, inspectionId),
        ),
      );
  }

  /** Upsert observations keyed by (inspection, checkpoint). Draft saves are
   * additive — unanswered checkpoints simply have no row yet. */
  async function saveObservations(
    orgId: string,
    inspectionId: string,
    inputs: ObservationInput[],
  ): Promise<void> {
    const existing = await listObservations(orgId, inspectionId);
    const byCheckpoint = new Map(existing.map((o) => [o.checkpointId, o]));

    for (const input of inputs) {
      const fields = {
        answer: input.answer ?? null,
        note: input.note ?? null,
        photoKeys: input.photoKeys ?? null,
        capturedLat: input.capturedLat ?? null,
        capturedLng: input.capturedLng ?? null,
      };
      const found = byCheckpoint.get(input.checkpointId);
      if (found) {
        await db
          .update(observations)
          .set({ ...fields, updatedAt: now() })
          .where(
            and(
              eq(observations.orgId, orgId),
              eq(observations.id, found.id),
            ),
          );
      } else {
        await db.insert(observations).values({
          id: newId(),
          orgId,
          inspectionId,
          checkpointId: input.checkpointId,
          ...fields,
        });
      }
    }
  }

  return {
    saveObservations,

    async create(input: InspectionCreate): Promise<InspectionWithObservations> {
      const [row] = await db
        .insert(inspections)
        .values({
          id: newId(),
          orgId: input.orgId,
          facilityId: input.facilityId,
          formId: input.formId,
          inspectorUserId: input.inspectorUserId,
          status: "draft",
          capturedLat: input.capturedLat ?? null,
          capturedLng: input.capturedLng ?? null,
        })
        .returning();
      return { ...row, observations: [] };
    },

    async getById(
      orgId: string,
      id: string,
    ): Promise<InspectionWithObservations | null> {
      const [row] = await db
        .select()
        .from(inspections)
        .where(and(eq(inspections.orgId, orgId), eq(inspections.id, id)))
        .limit(1);
      if (!row) return null;
      return { ...row, observations: await listObservations(orgId, id) };
    },

    async listByOrg(orgId: string): Promise<InspectionListRow[]> {
      const rows = await db
        .select({
          inspection: inspections,
          facilityName: facilities.name,
          formName: forms.name,
        })
        .from(inspections)
        .leftJoin(facilities, eq(inspections.facilityId, facilities.id))
        .leftJoin(forms, eq(inspections.formId, forms.id))
        .where(eq(inspections.orgId, orgId))
        .orderBy(desc(inspections.createdAt));
      return rows.map((r) => ({
        ...r.inspection,
        facilityName: r.facilityName,
        formName: r.formName,
      }));
    },

    async markSubmitted(
      orgId: string,
      id: string,
    ): Promise<Inspection | null> {
      const [row] = await db
        .update(inspections)
        .set({ status: "submitted", submittedAt: now(), updatedAt: now() })
        .where(and(eq(inspections.orgId, orgId), eq(inspections.id, id)))
        .returning();
      return row ?? null;
    },

    async delete(orgId: string, id: string): Promise<boolean> {
      await db
        .delete(observations)
        .where(
          and(
            eq(observations.orgId, orgId),
            eq(observations.inspectionId, id),
          ),
        );
      const rows = await db
        .delete(inspections)
        .where(and(eq(inspections.orgId, orgId), eq(inspections.id, id)))
        .returning({ id: inspections.id });
      return rows.length > 0;
    },
  };
}

export type InspectionsRepo = ReturnType<typeof createInspectionsRepo>;
