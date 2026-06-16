// Entry point for the inspkt setup-assistant tools (UraiJS).
//
// Tools are authored as `@tool`-decorated static methods grouped by domain;
// their JSDoc comments and arg interfaces are parsed into `declarations.ts`
// (auto-generated at build — do NOT write it by hand). This barrel re-exports
// each domain class so a single import pulls them all in (and keeps the
// classes from being tree-shaken before their decorators run).
//
// Auth/context contract (set by the widget embed + platform), see ./lib/api:
//   meta.secrets.URAI_API_HOST        — inspkt API origin
//   meta.vars.metadata._widget_token  — short-lived bearer (inspktw_…)
//   meta.vars.metadata.org_id         — org id
//   meta.vars.metadata._chat_log_id   — conversation id (sendCommand)
import _d from "./declarations";
const _t = _d;

export { ClientTools } from "./clients";
export { FacilityTools } from "./facilities";
export { EquipmentTypeTools } from "./equipment-types";
export { EquipmentTools } from "./equipment";
export { FormTools } from "./forms";
