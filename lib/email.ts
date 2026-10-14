import { config, env, optEnv } from "./config";

export interface Email { to: string | string[]; subject: string; html: string; internal?: boolean; }

/** Send through Resend. With DRY_RUN=true, emails are logged instead of sent. */
export async function sendEmail(email: Email): Promise<{ id: string; dryRun: boolean }> {
  const to = Array.isArray(email.to) ? email.to : [email.to];
  if (to.length === 0) return { id: "no-recipients", dryRun: true };
  if (config.dryRun) {
    console.log(`[DRY_RUN] email to ${to.join(", ")} — ${email.subject}\n${email.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600)}`);
    return { id: "dry-run", dryRun: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("EMAIL_FROM"),
      to,
      subject: email.subject,
      html: email.html,
      ...(optEnv("EMAIL_REPLY_TO") ? { reply_to: optEnv("EMAIL_REPLY_TO") } : {}),
      // Log prospect emails on the HubSpot timeline via your HubSpot BCC address
      ...(!email.internal && optEnv("HUBSPOT_BCC") ? { bcc: [optEnv("HUBSPOT_BCC")] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Email send failed ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return { id: data.id, dryRun: false };
}

export async function notifyTeam(msg: { subject: string; html: string }) {
  return sendEmail({ to: config.teamEmails, ...msg, internal: true });
}
