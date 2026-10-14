/**
 * The AI layer: "AI adds judgment and personalization" (deck slide 2).
 * Each agent returns structured JSON that n8n-style workflow code writes to HubSpot.
 */
import { structured, str, num, strArr, oneOf } from "./ai";
import { catalog } from "./catalog";
import { config } from "./config";

const base = () =>
  `You work inside the sales automation for ${config.companyName}. ${config.companyContext}
Be specific and factual. Never invent facts about a prospect — if something is unknown, say "unknown". Write in clear, warm, professional British English.`;

const catalogText = () =>
  catalog.services
    .map((s) => `- ${s.id}: ${s.name} — ${s.description}${s.billing === "monthly" ? ` (monthly; allowed terms: ${s.allowed_months?.join("/")} months)` : " (one-off)"}`)
    .join("\n");

// ─── 01 Prospect Research Agent ────────────────────────────
export interface Research {
  industry: string;
  target_audience: string;
  pain_points: string[];
  business_goals: string[];
  decision_maker: "likely" | "unlikely" | "unknown";
  marketing_opportunities: string[];
  lead_score: number;
  score_reasoning: string;
  recommended_service_id: string;
  recommended_next_action: string;
  personalization_hook: string;
  summary: string;
}

export function researchProspect(lead: Record<string, unknown>, siteText: string) {
  return structured<Research>({
    system: base(),
    name: "save_prospect_research",
    description: "Save research and qualification for a new prospect.",
    prompt: `Research and qualify this new lead.

LEAD DATA:
${JSON.stringify(lead, null, 2)}

COMPANY WEBSITE (may be empty):
${siteText || "(could not be fetched)"}

OUR SERVICES:
${catalogText()}

Scoring guide (0–100): fit with our services, clear growth ambition, signs of budget/traction, decision-maker contact, urgency in their message. Under 40 = poor fit, 40–69 = nurture/qualify on a call, 70+ = hot.
The personalization_hook is ONE specific, genuine observation about their product or business we can reference in emails (e.g. a feature, market, or recent launch from the website). Empty string if nothing concrete.`,
    schema: {
      properties: {
        industry: str("Likely industry"),
        target_audience: str("Who their customers appear to be"),
        pain_points: strArr("Likely marketing/growth pain points"),
        business_goals: strArr("Likely business goals"),
        decision_maker: oneOf(["likely", "unlikely", "unknown"], "Is the contact likely a decision maker?"),
        marketing_opportunities: strArr("Relevant marketing opportunities for us"),
        lead_score: num("0-100"),
        score_reasoning: str("One or two sentences"),
        recommended_service_id: oneOf(catalog.services.map((s) => s.id), "Best-fit service"),
        recommended_next_action: str("Concrete next action for sales"),
        personalization_hook: str("One specific observation to reference"),
        summary: str("3-5 sentence research summary for the sales team"),
      },
      required: ["industry", "target_audience", "pain_points", "business_goals", "decision_maker", "marketing_opportunities", "lead_score", "score_reasoning", "recommended_service_id", "recommended_next_action", "personalization_hook", "summary"],
    },
  });
}

// ─── Personalized paragraphs for templates ─────────────────
export async function personalParagraph(purpose: string, context: Record<string, unknown>): Promise<string> {
  const r = await structured<{ paragraph: string }>({
    system: base() + "\nYou write ONE short paragraph (2-3 sentences, max 70 words) to be inserted into an existing email template. No greeting, no sign-off, no subject line, no placeholders, no emojis.",
    name: "write_paragraph",
    description: "Return the paragraph.",
    prompt: `PURPOSE: ${purpose}\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}`,
    schema: { properties: { paragraph: str("The paragraph") }, required: ["paragraph"] },
    maxTokens: 400,
  });
  return r.paragraph.trim();
}

// ─── 04 Meeting Intelligence Agent ─────────────────────────
export interface Discovery {
  main_challenge: string;
  business_goal: string;
  acquisition_retention_problems: string;
  desired_services: string;
  budget: string;
  timeline: string;
  decision_maker_status: string;
  objections: string[];
  next_step: string;
  summary_for_prospect: string;
}

export function analyzeDiscovery(transcript: string, research: Record<string, unknown>) {
  return structured<Discovery>({
    system: base(),
    name: "save_discovery",
    description: "Save structured intelligence from a discovery call.",
    prompt: `Extract structured discovery information from this call transcript. Use only what was actually said; write "not discussed" where something did not come up.

PRIOR RESEARCH (for context only):
${JSON.stringify(research, null, 2)}

TRANSCRIPT:
${transcript.slice(0, 120_000)}

summary_for_prospect: 2-3 sentences addressed to the prospect ("you") that play back their main challenge, their goal for the business, and what they are looking for from a partner — this goes into the post-call email.`,
    schema: {
      properties: {
        main_challenge: str("Main challenge"),
        business_goal: str("Business / startup goal"),
        acquisition_retention_problems: str("Customer acquisition and retention problems"),
        desired_services: str("What they want from a marketing partner"),
        budget: str("Budget mentioned, or 'not discussed'"),
        timeline: str("Timeline, or 'not discussed'"),
        decision_maker_status: str("Who decides and how"),
        objections: strArr("Concerns or objections raised"),
        next_step: str("Agreed next step"),
        summary_for_prospect: str("Playback paragraph for the post-call email"),
      },
      required: ["main_challenge", "business_goal", "acquisition_retention_problems", "desired_services", "budget", "timeline", "decision_maker_status", "objections", "next_step", "summary_for_prospect"],
    },
    maxTokens: 3000,
  });
}

// ─── 05 Proposal Agent ─────────────────────────────────────
export interface ProposalDraft {
  selections: { service_id: string; months?: number; why: string }[];
  executive_summary: string;
  current_situation: string;
  strategy: string;
  timeline: string;
  kpis: string;
  next_steps: string;
}

export function draftProposal(input: Record<string, unknown>) {
  return structured<ProposalDraft>({
    system:
      base() +
      "\nYou write client proposals. You may ONLY recommend services from the approved catalogue, by id. Never mention prices or numbers for money — pricing is added separately from the approved price list.",
    name: "save_proposal",
    description: "Save the proposal draft.",
    prompt: `Write a tailored proposal built around this prospect's actual problems and goals.

PROSPECT DATA (research + discovery call):
${JSON.stringify(input, null, 2)}

APPROVED SERVICE CATALOGUE:
${JSON.stringify(catalog.services, null, 2)}

Pick 1-3 services that genuinely fit (respect their budget if stated). For monthly services choose a term from allowed_months.
Sections (plain text, use "• " bullets and line breaks, no markdown):
- executive_summary: 1 short paragraph
- current_situation: their situation and the problems identified
- strategy: recommended strategy and how the chosen services solve their problems
- timeline: phased timeline
- kpis: the KPIs we will report on
- next_steps: what happens after they accept`,
    schema: {
      properties: {
        selections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              service_id: oneOf(catalog.services.map((s) => s.id), "Service id"),
              months: num("Term in months (monthly services only)"),
              why: str("Why this service, tied to their problem"),
            },
            required: ["service_id", "why"],
          },
        },
        executive_summary: str(""),
        current_situation: str(""),
        strategy: str(""),
        timeline: str(""),
        kpis: str(""),
        next_steps: str(""),
      },
      required: ["selections", "executive_summary", "current_situation", "strategy", "timeline", "kpis", "next_steps"],
    },
    maxTokens: 4000,
  });
}

// ─── Proposal call / reply classification ──────────────────
export interface DecisionCall {
  decision: "won" | "pending" | "lost";
  reason: string;
  objections: string[];
  next_action: string;
  confidence: number;
}

export function classifyDecision(text: string, kind: "proposal call transcript" | "email reply") {
  return structured<DecisionCall>({
    system: base(),
    name: "save_decision",
    description: "Classify where the prospect stands after seeing the proposal.",
    prompt: `Classify the prospect's decision state from this ${kind}.
- won: they clearly accepted / want to proceed / asked for invoice or contract
- lost: they clearly declined, chose someone else, or said not now with no follow-up wanted
- pending: anything else (thinking, needs approval, has questions, wants changes)
When unsure, choose pending.

${kind.toUpperCase()}:
${text.slice(0, 120_000)}`,
    schema: {
      properties: {
        decision: oneOf(["won", "pending", "lost"], "Decision state"),
        reason: str("Why, in one or two sentences"),
        objections: strArr("Objections or open questions"),
        next_action: str("Recommended next action for the team"),
        confidence: num("0-1"),
      },
      required: ["decision", "reason", "objections", "next_action", "confidence"],
    },
    maxTokens: 800,
  });
}

export interface ReplyIntent {
  intent: "accepted" | "declined" | "question" | "wants_meeting" | "out_of_office" | "other";
  summary: string;
}

export function classifyReply(text: string) {
  return structured<ReplyIntent>({
    system: base(),
    name: "save_reply_intent",
    description: "Classify a prospect's email reply.",
    prompt: `Classify this reply from a prospect who has received our proposal.\n\nREPLY:\n${text.slice(0, 20_000)}`,
    schema: {
      properties: {
        intent: oneOf(["accepted", "declined", "question", "wants_meeting", "out_of_office", "other"], "Intent"),
        summary: str("One sentence summary for the team"),
      },
      required: ["intent", "summary"],
    },
    maxTokens: 300,
  });
}
