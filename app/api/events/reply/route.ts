/**
 * Stop or change sequences when the prospect replies (slide 1).
 * Body: { email, text } — forward prospect replies here from Gmail (Zapier/Make) or Resend inbound.
 */
import { webhook, readBody, ok, bad } from "@/lib/route";
import { handleReply } from "@/lib/workflows/07-follow-up";

export const maxDuration = 60;

export const POST = webhook(async (req) => {
  const b = await readBody(req);
  const email = b.email ?? b.from;
  const text = b.text ?? b.body ?? b.snippet ?? "";
  if (!email) return bad("email is required");
  const fromEmail = String(email).match(/[^\s<>]+@[^\s<>]+/)?.[0] ?? String(email);
  return ok(await handleReply(fromEmail, String(text)));
});
