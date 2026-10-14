/**
 * 04 Meeting Intelligence: Transcript → AI → CRM → post-call email
 * Also analyses the proposal-call transcript to classify the decision (slide 7).
 */
import * as hubspot from "../hubspot";
import { analyzeDiscovery, classifyDecision } from "../agents";
import { sendEmail } from "../email";
import { postDiscovery } from "../templates";
import { config } from "../config";
import { formatWhen } from "../time";
import { generateProposal } from "./05-proposal";
import { applyDecision } from "./08-deal-closure";

export interface TranscriptInput {
  email: string;
  transcript: string;
  meeting_type?: "discovery" | "proposal";
}

export async function handleTranscript(input: TranscriptInput) {
  const contact = await hubspot.findContactByEmail(input.email);
  if (!contact) throw new Error(`No HubSpot contact for ${input.email}`);
  const deal = await hubspot.openDealForContact(contact.id);
  if (!deal) throw new Error(`No open deal for ${input.email}`);

  // Work out which call this was if the caller didn't say.
  const type =
    input.meeting_type ??
    (["proposal_draft", "proposal_approved", "proposal_meeting", "follow_up"].includes(deal.properties.ehub_stage ?? "") ? "proposal" : "discovery");

  if (type === "proposal") {
    const d = await classifyDecision(input.transcript, "proposal call transcript");
    await hubspot.logNote(deal.id, `<b>Proposal call analysed</b>\nDecision: ${d.decision} (confidence ${d.confidence})\n${d.reason}\nObjections: ${d.objections.join("; ") || "none"}`);
    await applyDecision(deal.id, d.decision, d.reason, d.next_action);
    return { dealId: deal.id, type, decision: d };
  }

  // ── Discovery call ──
  const c = contact.properties;
  const d = await analyzeDiscovery(input.transcript, {
    company: c.company, industry: c.ehub_industry, research: c.ehub_research_summary,
  });

  await hubspot.setStage(deal.id, "discovery_done", {
    ehub_challenge: d.main_challenge,
    ehub_goal: d.business_goal,
    ehub_acquisition_problems: d.acquisition_retention_problems,
    ehub_desired_services: d.desired_services,
    ehub_budget: d.budget,
    ehub_timeline: d.timeline,
    ehub_objections: d.objections.join("\n"),
    ehub_next_step: d.next_step,
  }, `Discovery call analysed.\nChallenge: ${d.main_challenge}\nGoal: ${d.business_goal}\nBudget: ${d.budget} · Timeline: ${d.timeline}\nDecision maker: ${d.decision_maker_status}`);
  await hubspot.updateContact(contact.id, { ehub_decision_maker: d.decision_maker_status });

  const proposalMs = Number(deal.properties.ehub_proposal_meeting_date) || null;
  const email = postDiscovery({
    firstName: c.firstname,
    personal: d.summary_for_prospect,
    proposalCallWhen: proposalMs && proposalMs > Date.now() ? formatWhen(proposalMs, config.timezone) : null,
  });
  await sendEmail({ to: input.email, ...email });
  await hubspot.updateDeal(deal.id, { ehub_last_contacted: Date.now() });
  await hubspot.logNote(deal.id, `<b>Email sent:</b> ${email.subject}`);

  // Discovery data is now proposal-ready → draft the proposal for team approval.
  const proposal = await generateProposal(deal.id);
  return { dealId: deal.id, type, discovery: d, proposal };
}
