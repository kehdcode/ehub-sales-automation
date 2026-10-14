/** 08 Deal Closure: Won / Pending / Lost → next workflow */
import * as hubspot from "../hubspot";
import { sendEmail, notifyTeam } from "../email";
import { onboarding, teamWon } from "../templates";
import { createClientFolder } from "../google";
import { money } from "../catalog";
import { config, optEnv } from "../config";
import { addDays, hubspotDate } from "../time";
import { startSequence } from "./07-follow-up";

export type Decision = "won" | "pending" | "lost";

export async function applyDecision(dealId: string, decision: Decision, reason = "", nextAction?: string) {
  const deal = await hubspot.getDeal(dealId);
  const p = deal.properties;

  if (decision === "pending") {
    // Only start the sequence once; a second "pending" signal shouldn't restart it.
    if (p.ehub_sequence_status !== "active") await startSequence(dealId);
    await hubspot.updateDeal(dealId, { ehub_decision: "pending", ehub_decision_reason: reason, ehub_next_action: nextAction ?? "Automated follow-up sequence running" });
    return { dealId, decision };
  }

  const contact = await hubspot.contactForDeal(dealId);
  const c = contact?.properties ?? {};
  const company = c.company || c.email || "Client";

  if (decision === "won") {
    if (p.ehub_stage === "won") return { dealId, decision, status: "already_won" };
    let folderUrl: string | null = null;
    if (optEnv("GOOGLE_REFRESH_TOKEN") || optEnv("GOOGLE_SERVICE_ACCOUNT_JSON")) {
      folderUrl = await createClientFolder(company).catch((e) => { console.error("folder creation failed", e); return null; });
    }
    await hubspot.setStage(dealId, "won", {
      ehub_decision: "won",
      ehub_decision_reason: reason,
      ehub_sequence_status: p.ehub_sequence_status === "active" ? "stopped" : p.ehub_sequence_status,
      ehub_next_followup: null,
      ehub_next_action: "Onboarding kickoff",
      ehub_client_folder_url: folderUrl ?? "",
    }, `Closed won. ${reason}`);
    await hubspot.createTask(dealId, `Schedule onboarding kickoff — ${company}`, `Deal won. ${folderUrl ? `Client folder: ${folderUrl}` : ""}`, addDays(Date.now(), 1));
    if (c.email) {
      const email = onboarding({ firstName: c.firstname, company: c.company });
      await sendEmail({ to: c.email, ...email });
      await hubspot.logNote(dealId, `<b>Email sent:</b> ${email.subject}`);
    }
    await notifyTeam(teamWon({ company, amount: money(Number(p.ehub_proposal_amount ?? p.amount ?? 0)), folderUrl, dealUrl: hubspot.dealUrl(dealId) }));
    return { dealId, decision, folderUrl };
  }

  // lost
  await hubspot.setStage(dealId, "lost", {
    ehub_decision: "lost",
    ehub_decision_reason: reason || "Not specified",
    ehub_sequence_status: p.ehub_sequence_status === "active" ? "stopped" : p.ehub_sequence_status,
    ehub_next_followup: null,
    ehub_winback_date: hubspotDate(addDays(Date.now(), config.winbackDays)),
    ehub_next_action: nextAction ?? `Win-back outreach in ${config.winbackDays} days`,
  }, `Closed lost. Reason: ${reason || "not specified"}. Moved to nurture / win-back.`);
  return { dealId, decision };
}
