import { describe, expect, it } from "vitest";
import {
  WATER_HEATER_TYPE,
  waterHeaterForm,
} from "../../ai_tools/inspkt_client";
import { createEquipmentTypesRepo } from "../../workers/api/repositories/equipment-types-repo";
import { createFormsRepo } from "../../workers/api/repositories/forms-repo";
import { createEquipmentTypesService } from "../../workers/api/services/equipment-types-service";
import { createFormsService } from "../../workers/api/services/forms-service";
import {
  equipmentTypeCreateSchema,
  formCreateSchema,
} from "../../workers/api/validation";
import { makeOrg, testDb } from "../helpers/fixtures";

const ORG = "org_test_1";

// Exercises the inspkt_client example payloads through the SAME path a tool
// call takes: validate at the edge (zod), then the real service + repo over a
// test D1. Proves the create-form-with-checkpoints flow the LLM runs is
// actually accepted and persisted.
describe("inspkt_client example: water heater form", () => {
  it("creates the equipment type and a form with all checkpoints", async () => {
    const db = testDb();
    await makeOrg(db);
    const formsRepo = createFormsRepo(db);
    const equipmentTypesRepo = createEquipmentTypesRepo(db);
    const typesService = createEquipmentTypesService({
      equipmentTypesRepo,
      formsRepo,
    });
    const formsService = createFormsService({ formsRepo, equipmentTypesRepo });

    // 1. Equipment type (validated like the controller edge does).
    const typeInput = equipmentTypeCreateSchema.parse(WATER_HEATER_TYPE);
    const type = await typesService.create(ORG, typeInput);
    expect(type.name).toBe("Water Heater");
    expect(type.fields.find((f) => f.key === "fuel_type")?.type).toBe("select");

    // 2. Form with checkpoints, linked to the type.
    const formInput = formCreateSchema.parse(waterHeaterForm(type.id));
    const form = await formsService.create(ORG, formInput);

    expect(form.name).toBe("Residential Water Heater Inspection");
    expect(form.checkpoints).toHaveLength(7);
    expect(form.types.map((t) => t.id)).toContain(type.id);

    // The numeric checkpoint's range round-trips intact.
    const numeric = form.checkpoints.find((c) => c.answerType === "numeric");
    expect(numeric?.config).toEqual({
      unit: "°F",
      okMin: 115,
      okMax: 125,
      warnMin: 110,
      warnMax: 135,
    });
    // Critical flags preserved (T&P valve, tank body, gas/electric).
    expect(form.checkpoints.filter((c) => c.critical)).toHaveLength(4);
  });

  it("guards the example: an incoherent numeric range is rejected", () => {
    const bad = waterHeaterForm("type_x");
    const numeric = bad.checkpoints!.find((c) => c.answerType === "numeric")!;
    numeric.config = { ...numeric.config!, okMin: 200 }; // okMin > okMax
    expect(() => formCreateSchema.parse(bad)).toThrow();
  });
});
