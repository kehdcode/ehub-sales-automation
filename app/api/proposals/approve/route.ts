/**
 * Team approval gate. The email link opens a confirmation page (GET);
 * only the button press (POST) approves — so email link-scanners can't approve by accident.
 */
import { verifyToken } from "@/lib/auth";
import * as hubspot from "@/lib/hubspot";
import { approveProposal } from "@/lib/workflows/05-proposal";
import { money } from "@/lib/catalog";

const page = (body: string) =>
  new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proposal approval</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#1f2937}button{font-size:16px;padding:10px 18px;border-radius:8px;border:0;cursor:pointer;margin-right:8px}.yes{background:#16a34a;color:#fff}.no{background:#e5e7eb}textarea{width:100%;min-height:80px;margin:12px 0;font:inherit}a{color:#2563eb}</style></head><body>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const dealId = q.get("deal") ?? "";
  const token = q.get("token") ?? "";
  if (!verifyToken(`approve:${dealId}`, token)) return page("<h2>Link invalid or expired</h2>");
  const deal = await hubspot.getDeal(dealId);
  const p = deal.properties;
  return page(`<h2>${esc(p.dealname ?? "Proposal")}</h2>
<p>Amount: <b>${money(Number(p.ehub_proposal_amount ?? 0))}</b> · Status: <b>${esc(p.ehub_proposal_status ?? "")}</b></p>
${p.ehub_proposal_url ? `<p><a href="${esc(p.ehub_proposal_url)}" target="_blank">Open the Google Doc</a> — edit it first if anything needs changing.</p>` : "<p>The full draft is on the deal in HubSpot (notes).</p>"}
<form method="post">
<input type="hidden" name="deal" value="${esc(dealId)}"><input type="hidden" name="token" value="${esc(token)}">
<textarea name="note" placeholder="Optional note for the deal record"></textarea>
<button class="yes" name="decision" value="approve">Approve proposal</button>
<button class="no" name="decision" value="reject">Needs changes</button>
</form>`);
}

export async function POST(req: Request) {
  const f = await req.formData();
  const dealId = String(f.get("deal") ?? "");
  if (!verifyToken(`approve:${dealId}`, String(f.get("token") ?? ""))) return page("<h2>Link invalid or expired</h2>");
  const approved = f.get("decision") === "approve";
  await approveProposal(dealId, approved, String(f.get("note") ?? "") || undefined);
  return page(approved
    ? "<h2>✅ Approved</h2><p>The proposal link will be included in the proposal-call reminder.</p>"
    : "<h2>Sent back for changes</h2><p>Edit the doc, then approve it from the same link.</p>");
}
