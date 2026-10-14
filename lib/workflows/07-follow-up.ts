/**
 * 07 Follow-Up Agent: Proposal → engagement check → adaptive sequence
 * Never sends blindly: every send is preceded by a state check (slide 8).
 */
import * as hubspot from "../hubspot";
import { classifyReply, personalParagraph } from "../agents";
import { sendEmail } from "../email";
import { followUp, FOLLOW_UP_SUBJECTS } from "../templates";
import { config } from "../config";
import { addDays, hubspotDate, toMs } from "../time";
import { applyDecision } from "./08-deal-closure";

const TOTAL = FOLLOW_UP_SUBJECTS.length; // 4

const ANGLES = [
  "Gently check in. Tie the proposal back to the main challenge they described.",
  "Add one genuinely useful extra thought or idea related to their goal that wasn't in the proposal.",
  "Brief and light. Address their most likely hesitation (use the objections if any) without being pushy.",
  "Respectful close. Acknowledge timing may not be right and leave the door open.",
];

export async function startSequence(dealId: string) {
  await hubspot.setStage(dealId, "follow_up", {
    ehub_decision: "pending",
    ehub_sequence_status: "active",
    ehub_followup_step: 0,
    ehub_proposal_status: "sent",
    ehub_proposal_sent_date: hubspotDate(Date.now()),
    ehub_next_followup: addDays(Date.now(), config.followUpIntervals[0] ?? 3),
  }, `Follow-up sequence started (${TOTAL} emails, intervals ${config.followUpIntervals.join("/")} days).`);
}

export async function stopSequence(dealId: string, reason: string) {
  const deal = await hubspot.getDeal(dealId);
  if (deal.properties.ehub_sequence_status !== "active") return false;
  await hubspot.updateDeal(dealId, { ehub_sequence_status: "stopped", ehub_next_followup: null });
  await hubspot.logNote(dealId, `<b>Follow-up sequence stopped</b>\n${reason}`);
  return true;
}

/** Why we must NOT send right now (null = clear to send). */
function blocker(deal: hubspot.HsObject, contact: hubspot.HsObject | null): string | null {
  const p = deal.properties;
  if (p.ehub_stage !== "follow_up") return `deal stage changed to ${p.ehub_stage}`;
  if (p.ehub_decision === "won" || p.ehub_decision === "lost") return `decision is ${p.ehub_decision}`;
  if (!contact?.properties.email) return "no contact email";
  const lastContacted = toMs(p.ehub_last_contacted) ?? 0;
  const replied = toMs(contact.properties.hs_sales_email_last_replied);
  if (replied && replied > lastContacted) return "prospect replied";
  const nextActivity = toMs(p.notes_next_activity_date);
  if (nextActivity && nextActivity > Date.now()) return "a meeting/activity is scheduled";
  return null;
}

export async function runFollowUps() {
  const due = await hubspot.searchDeals([
    { propertyName: "ehub_sequence_status", operator: "EQ", value: "active" },
    { propertyName: "ehub_next_followup", operator: "LTE", value: String(Date.now()) },
  ]);

  const results: { dealId: string; status: string }[] = [];
  for (const deal of due) {
    try {
      const contact = await hubspot.contactForDeal(deal.id);
      const block = blocker(deal, contact);
      if (block) {
        await stopSequence(deal.id, `Engagement check: ${block}`);
        results.push({ dealId: deal.id, status: `stopped: ${block}` });
        continue;
      }
      const p = deal.properties;
      const sent = Number(p.ehub_followup_step ?? 0);

      // All four sent and the final wait has passed → nurture / closed-pending.
      if (sent >= TOTAL) {
        await hubspot.setStage(deal.id, "nurture", {
          ehub_sequence_status: "completed",
          ehub_next_followup: null,
          ehub_decision: "pending",
          ehub_next_action: "Add to long-term nurture; revisit next quarter",
        }, "No response after the full follow-up sequence — moved to nurture.");
        results.push({ dealId: deal.id, status: "moved_to_nurture" });
        continue;
      }

      const step = sent + 1;
      const c = contact!.properties;
      const personal = await personalParagraph(ANGLES[step - 1], {
        company: c.company, challenge: p.ehub_challenge, goal: p.ehub_goal,
        objections: p.ehub_objections, timeline: p.ehub_timeline, hook: c.ehub_personalization_hook,
      }).catch(() => "");
      const email = followUp(step, { firstName: c.firstname, personal, proposalUrl: p.ehub_proposal_pdf_url });
      await sendEmail({ to: c.email!, ...email });

      await hubspot.updateDeal(deal.id, {
        ehub_followup_step: step,
        ehub_last_contacted: Date.now(),
        ehub_next_followup: addDays(Date.now(), config.followUpIntervals[step] ?? 7),
      });
      await hubspot.logNote(deal.id, `<b>Follow-up ${step}/${TOTAL} sent:</b> ${email.subject}`);
      results.push({ dealId: deal.id, status: `sent_${step}` });
    } catch (e) {
      console.error(`follow-up failed for deal ${deal.id}`, e);
      results.push({ dealId: deal.id, status: `error: ${(e as Error).message}` });
    }
  }
  return results;
}

/** A prospect replied (forwarded from your inbox / Resend inbound / Zapier). */
export async function handleReply(email: string, text: string) {
  const contact = await hubspot.findContactByEmail(email);
  if (!contact) return { status: "unknown_contact" };
  const deal = await hubspot.openDealForContact(contact.id);
  if (!deal) return { status: "no_open_deal" };

  const intent = await classifyReply(text);
  await hubspot.logNote(deal.id, `<b>Prospect replied</b> (${intent.intent})\n${intent.summary}`);

  if (intent.intent === "out_of_office") {
    // Keep the sequence alive but push the next email back.
    await hubspot.updateDeal(deal.id, { ehub_next_followup: addDays(Date.now(), 5) });
    return { dealId: deal.id, intent, status: "postponed" };
  }

  await stopSequence(deal.id, `Prospect replied: ${intent.summary}`);
  if (intent.intent === "accepted") await applyDecision(deal.id, "won", intent.summary);
  else if (intent.intent === "declined") await applyDecision(deal.id, "lost", intent.summary);
  else
    await hubspot.createTask(deal.id, `Reply to ${contact.properties.firstname ?? email} (${intent.intent})`, intent.summary);
  return { dealId: deal.id, intent, status: "handled" };
}
