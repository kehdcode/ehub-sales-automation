/** 01 Lead Acquisition — generic intake for website forms, LinkedIn (via Zapier/Make), referrals, etc. */
import { webhook, readBody, ok, bad, background } from "@/lib/route";
import { ingestLead, researchAndScore, toLead } from "@/lib/workflows/01-lead-acquisition";

export const maxDuration = 60;

export const POST = webhook(async (req) => {
  const lead = toLead(await readBody(req));
  if (!lead) return bad("A valid email is required");
  const ids = await ingestLead(lead);
  background("lead-research", () => researchAndScore(ids.contactId, ids.dealId, lead));
  return ok({ ok: true, ...ids, research: "queued" }, 202);
});
