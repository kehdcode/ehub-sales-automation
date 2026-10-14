/**
 * 05 Proposal Generator: Discovery data → AI → Docs → PDF → Drive
 * Includes the team-approval gate from slide 5 ("Proposal approval by team").
 */
import * as hubspot from "../hubspot";
import { draftProposal } from "../agents";
import { priceSelections, investmentText, money } from "../catalog";
import { createProposalDocs, googleConfigured } from "../google";
import { notifyTeam } from "../email";
import { teamApproval } from "../templates";
import { signToken } from "../auth";
import { config } from "../config";

export async function generateProposal(dealId: string) {
  const deal = await hubspot.getDeal(dealId);
  const contact = await hubspot.contactForDeal(dealId);
  if (!contact) throw new Error(`Deal ${dealId} has no contact`);
  const c = contact.properties;
  const d = deal.properties;

  const draft = await draftProposal({
    company: c.company, contact_name: [c.firstname, c.lastname].filter(Boolean).join(" "), website: c.website,
    industry: c.ehub_industry, target_audience: c.ehub_target_audience, research: c.ehub_research_summary,
    pain_points: c.ehub_pain_points, business_goals: c.ehub_business_goals,
    discovery: {
      main_challenge: d.ehub_challenge, goal: d.ehub_goal, acquisition_retention: d.ehub_acquisition_problems,
      wants_from_partner: d.ehub_desired_services, budget: d.ehub_budget, timeline: d.ehub_timeline, objections: d.ehub_objections,
    },
  });

  // Pricing control: only approved services, priced in code.
  const priced = priceSelections(draft.selections);
  if (priced.lines.length === 0) throw new Error("AI selected no valid catalogue services");
  const investment = investmentText(priced.lines, priced.total);
  const scope = priced.lines
    .map((l) => {
      const why = draft.selections.find((s) => s.service_id === l.service.id)?.why ?? "";
      return `${l.service.name}\n${why}\n${l.service.deliverables.map((x) => `• ${x}`).join("\n")}`;
    })
    .join("\n\n");

  const company = c.company || [c.firstname, c.lastname].filter(Boolean).join(" ") || c.email || "Client";
  const fields: Record<string, string> = {
    client_name: [c.firstname, c.lastname].filter(Boolean).join(" "),
    company,
    date: new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: config.timezone }).format(new Date()),
    executive_summary: draft.executive_summary,
    current_situation: draft.current_situation,
    strategy: draft.strategy,
    scope,
    timeline: draft.timeline,
    kpis: draft.kpis,
    investment,
    next_steps: draft.next_steps,
  };

  let docUrl: string | null = null;
  let pdfUrl: string | null = null;
  if (googleConfigured()) {
    const docs = await createProposalDocs(`${config.companyName} Proposal — ${company}`, fields);
    docUrl = docs.docUrl;
    pdfUrl = docs.pdfUrl;
  } else {
    // No Google configured: keep the full draft on the deal so nothing is lost.
    await hubspot.logNote(dealId, `<b>Proposal draft (Google Docs not configured)</b>\n\n${Object.entries(fields).map(([k, v]) => `<b>${k}</b>\n${v}`).join("\n\n")}`);
  }

  await hubspot.setStage(dealId, "proposal_draft", {
    amount: priced.total,
    ehub_proposal_amount: priced.total,
    ehub_proposal_status: "pending_approval",
    ehub_proposal_url: docUrl ?? "",
    ehub_proposal_pdf_url: pdfUrl ?? "",
  }, `Proposal drafted — ${money(priced.total)}. Waiting for team approval.${priced.rejected.length ? `\nRejected non-catalogue items: ${priced.rejected.join(", ")}` : ""}`);

  const approveUrl = `${config.appUrl}/api/proposals/approve?deal=${dealId}&token=${signToken(`approve:${dealId}`)}`;
  await notifyTeam(teamApproval({ company, amount: money(priced.total), summary: draft.executive_summary, docUrl, approveUrl }));

  return { dealId, total: priced.total, docUrl, pdfUrl, services: priced.lines.map((l) => l.service.id) };
}

export async function approveProposal(dealId: string, approved: boolean, note?: string) {
  if (approved) {
    await hubspot.setStage(dealId, "proposal_approved", { ehub_proposal_status: "approved" }, `Proposal approved by team.${note ? `\n${note}` : ""}`);
  } else {
    await hubspot.updateDeal(dealId, { ehub_proposal_status: "rejected" });
    await hubspot.logNote(dealId, `<b>Proposal sent back for changes</b>${note ? `\n${note}` : ""}`);
  }
}
