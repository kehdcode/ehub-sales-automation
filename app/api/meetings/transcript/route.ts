/**
 * 04 Meeting Intelligence (discovery calls) and proposal-call decision analysis.
 * Body: { email, transcript, meeting_type?: "discovery" | "proposal" }
 * Send from Fireflies / tl;dv / Read.ai / Google Meet transcripts via Zapier or Make.
 */
import { webhook, readBody, ok, bad, background } from "@/lib/route";
import { handleTranscript } from "@/lib/workflows/04-meeting-intelligence";

export const maxDuration = 300;

export const POST = webhook(async (req) => {
  const b = await readBody(req);
  const email = b.email ?? b.attendee_email;
  const transcript = b.transcript ?? b.text ?? b.raw;
  if (!email || !transcript || String(transcript).length < 50) return bad("email and transcript are required");
  const meeting_type = b.meeting_type === "proposal" || b.meeting_type === "discovery" ? b.meeting_type : undefined;
  background("transcript", () => handleTranscript({ email, transcript: String(transcript), meeting_type }));
  return ok({ ok: true, status: "processing" }, 202);
});
