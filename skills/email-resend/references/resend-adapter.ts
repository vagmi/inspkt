// Resend via plain fetch — no SDK, keeps the Worker lean.
// Copy to: workers/api/adapters/resend.ts

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export function createResendSender(
  apiKey: string,
  // Use a verified domain in production. The sandbox sender below works
  // immediately for testing without verifying a domain.
  from = "Mudhal <onboarding@resend.dev>",
): EmailSender {
  return {
    async send(message) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
        }),
      });
      if (!res.ok) {
        throw new Error(`resend ${res.status}: ${await res.text()}`);
      }
    },
  };
}
