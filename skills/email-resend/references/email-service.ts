// A thin service over the email sender: owns templates and the "who/what" of
// each transactional email so controllers/actions stay simple.
// Copy to: workers/api/services/email-service.ts

import type { EmailSender } from "../adapters/resend";

export interface EmailServiceDeps {
  emailSender: EmailSender;
}

export function createEmailService({ emailSender }: EmailServiceDeps) {
  return {
    /** Example: confirm that something was created. Add one method per
     * transactional email your app sends. */
    async sendItemCreated(to: string, itemName: string): Promise<void> {
      await emailSender.send({
        to: [to],
        subject: `Created: ${itemName}`,
        html: renderItemCreated(itemName),
      });
    },
  };
}

export type EmailService = ReturnType<typeof createEmailService>;

/** Keep templates as plain functions returning HTML strings. For anything
 * elaborate, render with a templating lib at build time, not per-request. */
function renderItemCreated(itemName: string): string {
  return `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif; color: #2e2a23;">
      <h1 style="font-size: 20px;">Item created</h1>
      <p>Your item <strong>${escapeHtml(itemName)}</strong> was created successfully.</p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}
