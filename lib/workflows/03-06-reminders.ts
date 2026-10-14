/**
 * 03 Meeting Reminder: today's discovery meetings → reminder email
 * 06 Proposal Meeting: today's proposal meetings → reminder + proposal link
 * Runs every morning via Vercel Cron.
 */
import * as hubspot from "../hubspot";
import { sendEmail } from "../email";
import { discoveryReminder, proposalReminder } from "../templates";
import { config } from "../config";
import { formatWhen, todayBounds } from "../time";

async function remind(kind: "discovery" | "proposal") {
  const dateProp = kind === "discovery" ? "ehub_discovery_date" : "ehub_proposal_meeting_date";
  const flagProp = kind === "discovery" ? "ehub_discovery_reminded" : "ehub_proposal_reminded";
  const { start, end } = todayBounds(config.timezone);
  const deals = await hubspot.searchDeals([
    { propertyName: dateProp, operator: "BETWEEN", value: String(start), highValue: String(end) },
  ]);

  const results: { dealId: string; status: string }[] = [];
  for (const deal of deals) {
    const p = deal.properties;
    const meetingMs = Number(p[dateProp]);
    // idempotent: the flag stores which meeting we already reminded about
    if (p[flagProp] === String(meetingMs)) { results.push({ dealId: deal.id, status: "already_sent" }); continue; }
    if (["won", "lost"].includes(p.ehub_stage ?? "")) { results.push({ dealId: deal.id, status: "closed" }); continue; }
    try {
      const contact = await hubspot.contactForDeal(deal.id);
      if (!contact?.properties.email) { results.push({ dealId: deal.id, status: "no_contact" }); continue; }
      const when = formatWhen(meetingMs, config.timezone);
      const firstName = contact.properties.firstname;
      const email =
        kind === "discovery"
          ? discoveryReminder({ firstName, when, meetLink: p.ehub_discovery_link })
          : proposalReminder({
              firstName, when, meetLink: p.ehub_proposal_meeting_link,
              // only share the link once the team has approved the proposal
              proposalUrl: ["approved", "sent"].includes(p.ehub_proposal_status ?? "") ? p.ehub_proposal_pdf_url : null,
            });
      await sendEmail({ to: contact.properties.email, ...email });
      await hubspot.updateDeal(deal.id, { [flagProp]: String(meetingMs), ehub_last_contacted: Date.now() });
      await hubspot.logNote(deal.id, `<b>Email sent:</b> ${email.subject}`);
      results.push({ dealId: deal.id, status: "sent" });
    } catch (e) {
      console.error(`${kind} reminder failed for deal ${deal.id}`, e);
      results.push({ dealId: deal.id, status: `error: ${(e as Error).message}` });
    }
  }
  return results;
}

export async function runReminders() {
  return { discovery: await remind("discovery"), proposal: await remind("proposal") };
}
