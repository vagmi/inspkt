import _d from "./declarations";
// Force inclusion of declarations in compiled output (decorators rely on it).
const _t = _d;
import { apiFetch, clean, navigate } from "./lib/api";

interface CreateClientArgs {
  /** Client / company name. Required. */
  name: string;
  /** Primary contact person. */
  contactName: string | undefined;
  /** Contact email address (must be valid). */
  contactEmail: string | undefined;
  /** Contact phone number. */
  contactPhone: string | undefined;
  /** Freeform notes about the client. */
  notes: string | undefined;
}

class ClientTools {
  /**
   * List the organization's clients (the companies whose sites get inspected).
   * Call this before creating one to avoid duplicates.
   */
  @tool
  static async list_clients() {
    return await apiFetch("GET", "/api/clients");
  }

  /**
   * Create a client. Navigates the app to the new client's page on success.
   */
  @tool
  static async create_client({
    name,
    contactName,
    contactEmail,
    contactPhone,
    notes,
  }: CreateClientArgs) {
    const { client } = await apiFetch(
      "POST",
      "/api/clients",
      clean({ name, contactName, contactEmail, contactPhone, notes }),
    );
    await navigate(`/app/clients/${client.id}`);
    return { success: true, client_id: client.id, name: client.name };
  }
}
