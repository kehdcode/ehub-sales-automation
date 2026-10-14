/** 01 Lead Acquisition: Source → CRM → AI research → score */
import * as hubspot from "../hubspot";
import { researchProspect } from "../agents";
import { fetchSiteText } from "../web";
import { config } from "../config";
import { notifyTeam } from "../email";
import { teamHotLead } from "../templates";
import { catalog } from "../catalog";
import { hubspotDate } from "../time";

export interface LeadInput {
  email: string;
  firstname?: string;
  lastname?: string;
  company?: string;
  website?: string;
  phone?: string;
  jobtitle?: string;
  source?: string; // meta_ads | website | linkedin | referral | ...
  campaign?: string;
  message?: string;
  extra?: Record<string, unknown>;
}

/** Normalise form / Zapier / Make payloads (many field-name variants). */
export function toLead(b: any): LeadInput | null {
  const email = b.email ?? b.Email ?? b.work_email;
  if (!email || !/@/.test(email)) return null;
  let firstname = b.firstname ?? b.first_name;
  let lastname = b.lastname ?? b.last_name;
  if (!firstname && (b.name || b.full_name)) {
    const [f, ...r] = String(b.name ?? b.full_name).trim().split(/\s+/);
    firstname = f; lastname = r.join(" ");
  }
  return {
    email: String(email),
    firstname, lastname,
    company: b.company ?? b.company_name,
    website: b.website ?? b.company_website,
    phone: b.phone ?? b.phone_number,
    jobtitle: b.jobtitle ?? b.job_title,
    source: b.source ?? "website",
    campaign: b.campaign ?? b.utm_campaign,
    message: b.message ?? b.notes,
  };
}

/** Fast part (runs inside the webhook request): create or update contact + deal. */
export async function ingestLead(lead: LeadInput) {
  const email = lead.email.trim().toLowerCase();
  const contact = await hubspot.upsertContact(email, {
    firstname: lead.firstname,
    lastname: lead.lastname,
    company: lead.company,
    website: lead.website,
    phone: lead.phone,
    jobtitle: lead.jobtitle,
    ehub_lead_source: lead.source ?? "unknown",
    ehub_campaign: lead.campaign,
    ehub_lead_date: hubspotDate(Date.now()),
  });

  let deal = await hubspot.openDealForContact(contact.id);
  let isNew = false;
  if (!deal) {
    deal = await hubspot.createDeal(contact.id, {
      dealname: `${lead.company || [lead.firstname, lead.lastname].filter(Boolean).join(" ") || email} — New business`,
      ehub_stage: "new",
      ehub_sequence_status: "none",
      ehub_followup_step: 0,
    });
    isNew = true;
    await hubspot.logNote(deal.id, `<b>New lead</b> from ${lead.source ?? "unknown"}${lead.campaign ? ` (${lead.campaign})` : ""}${lead.message ? `\nMessage: ${lead.message}` : ""}`);
  }
  return { contactId: contact.id, dealId: deal.id, isNew };
}

/** Slow part (runs after the response): AI research, scoring, write-back. */
export async function researchAndScore(contactId: string, dealId: string, lead: LeadInput) {
  const site = await fetchSiteText(lead.website);
  const r = await researchProspect({ ...lead }, site);
  const score = Math.max(0, Math.min(100, Math.round(r.lead_score)));
  const service = catalog.services.find((s) => s.id === r.recommended_service_id);

  await hubspot.updateContact(contactId, {
    ehub_lead_score: score,
    ehub_industry: r.industry,
    ehub_target_audience: r.target_audience,
    ehub_pain_points: r.pain_points.join("\n"),
    ehub_business_goals: r.business_goals.join("\n"),
    ehub_decision_maker: r.decision_maker,
    ehub_recommended_service: service?.name ?? r.recommended_service_id,
    ehub_research_summary: `${r.summary}\n\nOpportunities:\n${r.marketing_opportunities.map((o) => `• ${o}`).join("\n")}\n\nScore reasoning: ${r.score_reasoning}`,
    ehub_personalization_hook: r.personalization_hook,
  });

  await hubspot.setStage(
    dealId,
    score >= 40 ? "qualified" : "nurture",
    { ehub_next_action: r.recommended_next_action },
    `AI lead score: <b>${score}</b> — ${r.score_reasoning}\nRecommended: ${service?.name ?? "—"}\nNext: ${r.recommended_next_action}`,
  );

  if (score >= config.hotLeadScore) {
    const name = [lead.firstname, lead.lastname].filter(Boolean).join(" ") || lead.email;
    await notifyTeam(teamHotLead({
      name, company: lead.company ?? "", score, summary: r.summary,
      service: service?.name ?? "", dealUrl: hubspot.dealUrl(dealId),
    }));
  }
  return { score, research: r };
}
