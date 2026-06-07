import { createApi } from "./index";

/** Shared API instance — used by the Worker fetch handler and invoked
 * in-process by React Router loaders (app/lib/api-client.server.ts). */
export const api = createApi();
