import _d from "./declarations";
// Force inclusion of declarations in compiled output (decorators rely on it).
const _t = _d;
import { apiFetch, clean, navigate } from "./lib/api";

interface CheckpointConfig {
  /** Numeric: unit label (e.g. "psi"). */
  unit: string | undefined;
  /** Numeric: lower bound of the OK range. */
  okMin: number | undefined;
  /** Numeric: upper bound of the OK range. */
  okMax: number | undefined;
  /** Numeric: lower warn bound. Rating: minimum rating for a warn. */
  warnMin: number | undefined;
  /** Numeric: upper warn bound. */
  warnMax: number | undefined;
  /** Rating: maximum value of the scale (2..10). */
  scaleMax: number | undefined;
  /** Rating: minimum rating that passes. */
  passMin: number | undefined;
}

interface FormCheckpoint {
  /** Section heading this checkpoint belongs to. */
  section: string | undefined;
  /** The question/prompt shown to the inspector. Required. */
  prompt: string;
  /** Answer type: pass_fail | numeric | rating | observation. Required. */
  answerType: string;
  /** Severity if it fails: minor | major | critical. */
  severity: string | undefined;
  /** A failure here fails the whole inspection regardless of score. */
  critical: boolean | undefined;
  /** Whether a photo is required to answer. */
  photoRequired: boolean | undefined;
  /** Range/threshold config (required for numeric and rating). */
  config: CheckpointConfig | undefined;
}

interface CreateFormArgs {
  /** Form name. Required. */
  name: string;
  /** Description of the form / rubric. */
  description: string | undefined;
  /** Ordered checkpoints. Build these from the described or uploaded PDF form. */
  checkpoints: FormCheckpoint[] | undefined;
  /** Equipment type ids this form applies to. */
  typeIds: string[] | undefined;
}

interface UpdateCheckpointArgs {
  /** Id of the form the checkpoint belongs to. Required. */
  formId: string;
  /** Id of the checkpoint to edit. Required. */
  checkpointId: string;
  /** New prompt text. */
  prompt: string | undefined;
  /** New severity: minor | major | critical. */
  severity: string | undefined;
  /** Whether a failure fails the whole inspection. */
  critical: boolean | undefined;
  /** Whether a photo is required. */
  photoRequired: boolean | undefined;
  /** Numeric: lower bound of the OK range. */
  okMin: number | undefined;
  /** Numeric: upper bound of the OK range. */
  okMax: number | undefined;
  /** Numeric: lower warn bound. Rating: minimum rating for a warn. */
  warnMin: number | undefined;
  /** Numeric: upper warn bound. */
  warnMax: number | undefined;
  /** Numeric: unit label. */
  unit: string | undefined;
  /** Rating: maximum scale value. */
  scaleMax: number | undefined;
  /** Rating: minimum passing rating. */
  passMin: number | undefined;
}

interface AttachFormToTypeArgs {
  /** Equipment type id. Required. */
  typeId: string;
  /** Form id to attach. Required. */
  formId: string;
}

class FormTools {
  /** List inspection forms (the rubrics applied during an inspection). */
  @tool
  static async list_forms() {
    return await apiFetch("GET", "/api/forms");
  }

  /**
   * Create an inspection form with checkpoints, optionally attached to
   * equipment types. Use this for the "create a form from a PDF / described
   * fields" flow: turn each field on the form into a checkpoint. numeric and
   * rating checkpoints need a config (ranges / thresholds).
   */
  @tool
  static async create_form({
    name,
    description,
    checkpoints,
    typeIds,
  }: CreateFormArgs) {
    const { form } = await apiFetch(
      "POST",
      "/api/forms",
      clean({ name, description, checkpoints, typeIds }),
    );
    await navigate(`/app/forms/${form.id}`);
    return {
      success: true,
      form_id: form.id,
      name: form.name,
      checkpoints: form.checkpoints?.length ?? 0,
    };
  }

  /**
   * Adjust a single checkpoint on an existing form — e.g. change a numeric OK
   * range or a rating threshold — without resending the whole form. Reads the
   * checkpoint's current config and merges only the range fields you pass, so
   * you can change just okMax. The server validates the result and keeps the
   * checkpoint id stable.
   */
  @tool
  static async update_checkpoint({
    formId,
    checkpointId,
    prompt,
    severity,
    critical,
    photoRequired,
    okMin,
    okMax,
    warnMin,
    warnMax,
    unit,
    scaleMax,
    passMin,
  }: UpdateCheckpointArgs) {
    // Read the current checkpoint so we can merge into its existing config —
    // config is replaced wholesale by the API, so we send a complete one.
    const { form } = await apiFetch("GET", `/api/forms/${formId}`);
    const cp = (form.checkpoints || []).find(
      (c: any) => c.id === checkpointId,
    );
    if (!cp) {
      throw new Error(`checkpoint ${checkpointId} not found on form ${formId}`);
    }

    const patch: Record<string, unknown> = clean({
      prompt,
      severity,
      critical,
      photoRequired,
    });

    if (cp.answerType === "numeric") {
      patch.config = clean({
        unit: unit ?? cp.config?.unit,
        okMin: okMin ?? cp.config?.okMin,
        okMax: okMax ?? cp.config?.okMax,
        warnMin: warnMin ?? cp.config?.warnMin,
        warnMax: warnMax ?? cp.config?.warnMax,
      });
    } else if (cp.answerType === "rating") {
      patch.config = clean({
        scaleMax: scaleMax ?? cp.config?.scaleMax,
        passMin: passMin ?? cp.config?.passMin,
        warnMin: warnMin ?? cp.config?.warnMin,
      });
    }

    const { form: updated } = await apiFetch(
      "PATCH",
      `/api/forms/${formId}/checkpoints/${checkpointId}`,
      patch,
    );
    await navigate(`/app/forms/${formId}`);
    return { success: true, form_id: formId, checkpoint_id: checkpointId, form: updated };
  }

  /**
   * Link an existing form to an existing equipment type (additive — keeps the
   * type's other forms).
   */
  @tool
  static async attach_form_to_type({ typeId, formId }: AttachFormToTypeArgs) {
    const { type } = await apiFetch("GET", `/api/equipment-types/${typeId}`);
    const formIds: string[] = Array.isArray(type.formIds) ? type.formIds : [];
    if (formIds.includes(formId)) {
      return { success: true, type_id: typeId, already_linked: true };
    }
    await apiFetch("PATCH", `/api/equipment-types/${typeId}`, {
      formIds: [...formIds, formId],
    });
    return { success: true, type_id: typeId, form_id: formId };
  }
}
