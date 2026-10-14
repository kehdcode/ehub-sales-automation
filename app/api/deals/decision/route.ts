/** 08 Deal Closure — record a decision manually. Body: { deal_id, decision: "won"|"pending"|"lost", reason? } */
import { webhook, readBody, ok, bad } from "@/lib/route";
import { applyDecision } from "@/lib/workflows/08-deal-closure";

export const maxDuration = 60;

export const POST = webhook(async (req) => {
  const b = await readBody(req);
  if (!b.deal_id || !["won", "pending", "lost"].includes(b.decision)) return bad("deal_id and decision (won|pending|lost) are required");
  return ok(await applyDecision(String(b.deal_id), b.decision, b.reason ?? ""));
});
