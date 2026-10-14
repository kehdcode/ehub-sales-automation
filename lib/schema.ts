/**
 * Milestone 1 — CRM foundation.
 * Custom HubSpot properties that make HubSpot the source of truth (deck slide 11).
 * `npm run setup:hubspot` creates all of these in your portal.
 */

export type Stage =
  | "new"
  | "qualified"
  | "discovery_booked"
  | "discovery_done"
  | "proposal_draft"
  | "proposal_approved"
  | "proposal_meeting"
  | "follow_up"
  | "won"
  | "lost"
  | "nurture";

export const STAGES: Stage[] = [
  "new", "qualified", "discovery_booked", "discovery_done", "proposal_draft",
  "proposal_approved", "proposal_meeting", "follow_up", "won", "lost", "nurture",
];

type PropType = "string" | "number" | "date" | "datetime" | "enumeration";
type FieldType = "text" | "textarea" | "number" | "date" | "select";

export interface PropDef {
  name: string;
  label: string;
  type: PropType;
  fieldType: FieldType;
  options?: string[];
}

const p = (name: string, label: string, type: PropType, fieldType: FieldType, options?: string[]): PropDef =>
  ({ name, label, type, fieldType, options });

/** Identity, Acquisition, Qualification → contact */
export const CONTACT_PROPERTIES: PropDef[] = [
  p("ehub_lead_source", "Lead source", "string", "text"),
  p("ehub_campaign", "Campaign", "string", "text"),
  p("ehub_lead_date", "Lead date", "date", "date"),
  p("ehub_lead_score", "Lead score (AI)", "number", "number"),
  p("ehub_industry", "Industry (AI)", "string", "text"),
  p("ehub_target_audience", "Target audience (AI)", "string", "textarea"),
  p("ehub_pain_points", "Pain points (AI)", "string", "textarea"),
  p("ehub_business_goals", "Business goals (AI)", "string", "textarea"),
  p("ehub_decision_maker", "Decision-maker status (AI)", "string", "text"),
  p("ehub_recommended_service", "Recommended service (AI)", "string", "text"),
  p("ehub_research_summary", "Prospect research (AI)", "string", "textarea"),
  p("ehub_personalization_hook", "Personalization hook (AI)", "string", "textarea"),
];

/** Meetings, Discovery, Proposal, Decision, Automation → deal */
export const DEAL_PROPERTIES: PropDef[] = [
  p("ehub_stage", "Automation stage", "enumeration", "select", STAGES),
  // Meetings
  p("ehub_discovery_date", "Discovery call date", "datetime", "date"),
  p("ehub_discovery_link", "Discovery meeting link", "string", "text"),
  p("ehub_discovery_reminded", "Discovery reminder sent", "string", "text"),
  p("ehub_proposal_meeting_date", "Proposal meeting date", "datetime", "date"),
  p("ehub_proposal_meeting_link", "Proposal meeting link", "string", "text"),
  p("ehub_proposal_reminded", "Proposal reminder sent", "string", "text"),
  // Discovery
  p("ehub_challenge", "Main challenge", "string", "textarea"),
  p("ehub_goal", "Business goal", "string", "textarea"),
  p("ehub_acquisition_problems", "Acquisition / retention problems", "string", "textarea"),
  p("ehub_desired_services", "What they want from a partner", "string", "textarea"),
  p("ehub_budget", "Budget", "string", "text"),
  p("ehub_timeline", "Timeline", "string", "text"),
  p("ehub_objections", "Objections", "string", "textarea"),
  p("ehub_next_step", "Agreed next step", "string", "text"),
  // Proposal
  p("ehub_proposal_status", "Proposal status", "enumeration", "select", ["draft", "pending_approval", "approved", "rejected", "sent"]),
  p("ehub_proposal_url", "Proposal doc URL", "string", "text"),
  p("ehub_proposal_pdf_url", "Proposal PDF URL", "string", "text"),
  p("ehub_proposal_amount", "Proposal amount", "number", "number"),
  p("ehub_proposal_sent_date", "Proposal sent date", "date", "date"),
  // Decision
  p("ehub_decision", "Decision", "enumeration", "select", ["won", "pending", "lost"]),
  p("ehub_decision_reason", "Decision reason", "string", "textarea"),
  p("ehub_next_action", "Next action", "string", "text"),
  p("ehub_winback_date", "Win-back date", "date", "date"),
  // Automation
  p("ehub_last_contacted", "Last contacted (automation)", "datetime", "date"),
  p("ehub_next_followup", "Next follow-up", "datetime", "date"),
  p("ehub_sequence_status", "Sequence status", "enumeration", "select", ["none", "active", "stopped", "completed"]),
  p("ehub_followup_step", "Follow-up emails sent", "number", "number"),
  p("ehub_client_folder_url", "Client folder URL", "string", "text"),
];

export const CONTACT_PROP_NAMES = [
  "email", "firstname", "lastname", "company", "website", "phone", "jobtitle",
  "hs_sales_email_last_replied",
  ...CONTACT_PROPERTIES.map((d) => d.name),
];

export const DEAL_PROP_NAMES = [
  "dealname", "dealstage", "pipeline", "amount", "notes_next_activity_date",
  ...DEAL_PROPERTIES.map((d) => d.name),
];
