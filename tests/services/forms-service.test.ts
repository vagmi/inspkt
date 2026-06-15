import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../workers/api/services/errors";
import { createFormsService } from "../../workers/api/services/forms-service";
import {
  fakeCheckpoint,
  fakeEquipmentType,
  fakeForm,
  mockEquipmentTypesRepo,
  mockFormsRepo,
} from "../helpers/mocks";

const ORG = "org_test_1";

function makeService() {
  const formsRepo = mockFormsRepo();
  const equipmentTypesRepo = mockEquipmentTypesRepo();
  const service = createFormsService({ formsRepo, equipmentTypesRepo });
  // Default: no type associations unless a test says otherwise.
  equipmentTypesRepo.typesForForm.mockResolvedValue([]);
  equipmentTypesRepo.typeLinksByForm.mockResolvedValue([]);
  return { service, formsRepo, equipmentTypesRepo };
}

describe("forms service", () => {
  it("create passes the payload through with the org id", async () => {
    const { service, formsRepo, equipmentTypesRepo } = makeService();
    const created = { ...fakeForm(), checkpoints: [fakeCheckpoint()] };
    formsRepo.create.mockResolvedValue(created);

    const input = {
      name: "Vehicle Pre-Trip",
      checkpoints: [
        {
          prompt: "Tires inflated",
          answerType: "pass_fail" as const,
          severity: "major" as const,
          critical: false,
          photoRequired: false,
        },
      ],
    };
    const result = await service.create(ORG, input);
    expect(result).toMatchObject({ ...created, types: [] });
    expect(formsRepo.create).toHaveBeenCalledWith({ ...input, orgId: ORG });
    // No typeIds in the input → the join is left untouched.
    expect(equipmentTypesRepo.setTypesForForm).not.toHaveBeenCalled();
  });

  it("create associates equipment types when typeIds are given", async () => {
    const { service, formsRepo, equipmentTypesRepo } = makeService();
    const created = { ...fakeForm({ id: "form_9" }), checkpoints: [] };
    formsRepo.create.mockResolvedValue(created);
    equipmentTypesRepo.getById.mockResolvedValue(fakeEquipmentType());

    await service.create(ORG, { name: "F", checkpoints: [], typeIds: ["type_1"] });
    // typeIds is not forwarded to the forms repo…
    expect(formsRepo.create).toHaveBeenCalledWith({
      name: "F",
      checkpoints: [],
      orgId: ORG,
    });
    // …it's applied to the join after the form exists.
    expect(equipmentTypesRepo.setTypesForForm).toHaveBeenCalledWith(
      ORG,
      "form_9",
      ["type_1"],
    );
  });

  it("get includes the types the form applies to", async () => {
    const { service, formsRepo, equipmentTypesRepo } = makeService();
    formsRepo.getById.mockResolvedValue({ ...fakeForm(), checkpoints: [] });
    equipmentTypesRepo.typesForForm.mockResolvedValue([
      { id: "type_1", name: "Rooftop HVAC" },
    ]);

    const form = await service.get(ORG, "form_1");
    expect(form.types).toEqual([{ id: "type_1", name: "Rooftop HVAC" }]);
    expect(equipmentTypesRepo.typesForForm).toHaveBeenCalledWith(ORG, "form_1");
  });

  it("get throws NotFoundError for missing forms", async () => {
    const { service, formsRepo } = makeService();
    formsRepo.getById.mockResolvedValue(null);

    await expect(service.get(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("list groups attached types under each form", async () => {
    const { service, formsRepo, equipmentTypesRepo } = makeService();
    formsRepo.listByOrg.mockResolvedValue([
      { ...fakeForm({ id: "form_1" }), checkpointCount: 2 },
      { ...fakeForm({ id: "form_2" }), checkpointCount: 0 },
    ]);
    equipmentTypesRepo.typeLinksByForm.mockResolvedValue([
      { formId: "form_1", type: { id: "type_1", name: "HVAC" } },
      { formId: "form_1", type: { id: "type_2", name: "Van" } },
    ]);

    const list = await service.list(ORG);
    expect(list[0].types.map((t) => t.name)).toEqual(["HVAC", "Van"]);
    expect(list[1].types).toEqual([]);
  });

  it("update applies typeIds and validates they exist", async () => {
    const { service, formsRepo, equipmentTypesRepo } = makeService();
    formsRepo.update.mockResolvedValue({ ...fakeForm(), checkpoints: [] });
    equipmentTypesRepo.getById.mockResolvedValue(fakeEquipmentType());

    await service.update(ORG, "form_1", { typeIds: ["type_1"] });
    expect(equipmentTypesRepo.getById).toHaveBeenCalledWith(ORG, "type_1");
    expect(equipmentTypesRepo.setTypesForForm).toHaveBeenCalledWith(
      ORG,
      "form_1",
      ["type_1"],
    );
  });

  it("update rejects an unknown equipment type before touching the form", async () => {
    const { service, formsRepo, equipmentTypesRepo } = makeService();
    equipmentTypesRepo.getById.mockResolvedValue(null);

    await expect(
      service.update(ORG, "form_1", { typeIds: ["ghost"] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(formsRepo.update).not.toHaveBeenCalled();
    expect(equipmentTypesRepo.setTypesForForm).not.toHaveBeenCalled();
  });

  it("update throws NotFoundError when the repo misses", async () => {
    const { service, formsRepo } = makeService();
    formsRepo.update.mockResolvedValue(null);

    await expect(
      service.update(ORG, "nope", { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete throws NotFoundError when nothing was deleted", async () => {
    const { service, formsRepo } = makeService();
    formsRepo.delete.mockResolvedValue(false);

    await expect(service.delete(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
