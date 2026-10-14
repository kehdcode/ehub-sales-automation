/** 05 Proposal Generator — manual (re)generation. Body: { deal_id } */
import { webhook, readBody, ok, bad, background } from "@/lib/route";
import { generateProposal } from "@/lib/workflows/05-proposal";

export const maxDuration = 300;

export const POST = webhook(async (req) => {
  const { deal_id } = await readBody(req);
  if (!deal_id) return bad("deal_id is required");
  background("proposal", () => generateProposal(String(deal_id)));
  return ok({ ok: true, status: "generating" }, 202);
});
