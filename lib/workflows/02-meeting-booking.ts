/** 02 Meeting Booking: Booking → personalized confirmation → CRM  (also records proposal-call bookings for 06) */
import * as hubspot from "../hubspot";
import { personalParagraph } from "../agents";
import { sendEmail } from "../email";
import { discoveryConfirmation } from "../templates";
import { config } from "../config";
import { formatWhen, toMs } from "../time";
import { ingestLead, researchAndScore } from "./01-lead-acquisition";
import { stopSequence } from "./07-follow-up";

export interface Booking {
  action: "created" | "cancelled";
  type: "discovery" | "proposal";
  email: string;
  name?: string;
  startMs: number;
  meetLink?: string;
  notes?: string;
}

/** Accepts Cal.com, Calendly or a simple generic payload. */
export function normalizeBooking(body: any): Booking | null {
  const detectType = (label: string | undefined, explicit?: string): Booking["type"] =>
    explicit === "proposal" || explicit === "discovery"
      ? explicit
      : /proposal/i.test(label ?? "") ? "proposal" : "discovery";

  // Cal.com
  if (body?.triggerEvent && body?.payload) {
    const p = body.payload;
    const a = p.attendees?.[0] ?? {};
    return {
      action: /CANCEL/i.test(body.triggerEvent) ? "cancelled" : "created",
      type: detectType(`${p.type ?? ""} ${p.title ?? ""} ${p.eventTitle ?? ""}`),
      email: a.email,
      name: a.name,
      startMs: toMs(p.startTime) ?? 0,
      meetLink: p.metadata?.videoCallUrl ?? (typeof p.location === "string" && p.location.startsWith("http") ? p.location : undefined),
      notes: p.responses?.notes?.value ?? p.additionalNotes,
    };
  }
  // Calendly
  if (body?.event?.startsWith?.("invitee.") && body?.payload) {
    const p = body.payload;
    const ev = p.scheduled_event ?? {};
    return {
      action: body.event === "invitee.canceled" ? "cancelled" : "created",
      type: detectType(ev.name),
      email: p.email,
      name: p.name,
      startMs: toMs(ev.start_time) ?? 0,
      meetLink: ev.location?.join_url,
      notes: p.questions_and_answers?.map((q: any) => `${q.question}: ${q.answer}`).join("\n"),
    };
  }
  // Generic (e.g. Google Calendar via Zapier/Make, or your own form)
  if (body?.email && (body?.start_time || body?.startTime)) {
    return {
      action: /cancel/i.test(body.event ?? body.action ?? "") ? "cancelled" : "created",
      type: detectType(body.event_name, body.meeting_type),
      email: body.email,
      name: body.name,
      startMs: toMs(body.start_time ?? body.startTime) ?? 0,
      meetLink: body.meeting_link ?? body.meet_link,
      notes: body.notes,
    };
  }
  return null;
}

export async function handleBooking(b: Booking) {
  const [firstname, ...rest] = (b.name ?? "").trim().split(/\s+/);
  let contact = await hubspot.findContactByEmail(b.email);
  let dealId: string;

  if (!contact) {
    // Booked without coming through a lead source — run lead acquisition first.
    const lead = { email: b.email, firstname, lastname: rest.join(" "), source: "booking", message: b.notes };
    const ids = await ingestLead(lead);
    await researchAndScore(ids.contactId, ids.dealId, lead).catch((e) => console.error("research failed", e));
    contact = await hubspot.getContact(ids.contactId);
    dealId = ids.dealId;
  } else {
    const deal = await hubspot.openDealForContact(contact.id);
    dealId = deal ? deal.id : (await ingestLead({ email: b.email, source: "booking" })).dealId;
  }

  const when = formatWhen(b.startMs, config.timezone);

  if (b.action === "cancelled") {
    const field = b.type === "discovery" ? "ehub_discovery_date" : "ehub_proposal_meeting_date";
    await hubspot.updateDeal(dealId, { [field]: null });
    await hubspot.logNote(dealId, `<b>${b.type} call cancelled</b> (was ${when})`);
    return { dealId, action: "cancelled" };
  }

  // A new booking means the prospect is engaged — stop any running follow-up sequence.
  await stopSequence(dealId, `Prospect booked a ${b.type} call`);

  if (b.type === "proposal") {
    await hubspot.setStage(dealId, "proposal_meeting", {
      ehub_proposal_meeting_date: b.startMs,
      ehub_proposal_meeting_link: b.meetLink ?? "",
      ehub_proposal_reminded: "",
    }, `Proposal call booked for ${when}`);
    return { dealId, action: "proposal_booked" };
  }

  await hubspot.setStage(dealId, "discovery_booked", {
    ehub_discovery_date: b.startMs,
    ehub_discovery_link: b.meetLink ?? "",
    ehub_discovery_reminded: "",
  }, `Discovery call booked for ${when}`);

  const c = contact.properties;
  const personal = await personalParagraph(
    "Show we've done our homework: reference one specific thing about their product or business, and say what we're keen to explore on the call. Skip it entirely if we know nothing specific.",
    { company: c.company, website: c.website, hook: c.ehub_personalization_hook, research: c.ehub_research_summary, their_notes: b.notes },
  ).catch(() => "");

  const email = discoveryConfirmation({ firstName: c.firstname || firstname, when, meetLink: b.meetLink, personal });
  await sendEmail({ to: b.email, ...email });
  await hubspot.updateDeal(dealId, { ehub_last_contacted: Date.now() });
  await hubspot.logNote(dealId, `<b>Email sent:</b> ${email.subject}`);
  return { dealId, action: "discovery_booked" };
}
