/**
 * Test console actions (used by /console). Protected by WEBHOOK_SECRET.
 * Body: { action: "setup_hubspot" | "test_lead" | "run_reminders" | "run_followups", lead?: {...} }
 */
import { webhook, readBody, ok, bad } from "@/lib/route";
import { integrationStatus } from "@/lib/config";
import { setupHubspot } from "@/lib/setup";
import * as hubspot from "@/lib/hubspot";
import { ingestLead, researchAndScore, toLead } from "@/lib/workflows/01-lead-acquisition";
import { runReminders } from "@/lib/workflows/03-06-reminders";
import { runFollowUps } from "@/lib/workflows/07-follow-up";

export const maxDuration = 120;

export const POST = webhook(async (req) => {
  const body = await readBody(req);
  switch (body.action) {
    case "status":
      return ok({ integrations: integrationStatus() });

    case "setup_hubspot":
      return ok(await setupHubspot());

    case "test_lead": {
      // Runs workflow 01 end to end (synchronously, so the result shows on screen).
      const lead = toLead({ source: "test_console", ...(body.lead ?? {}) });
      if (!lead) return bad("A valid email is required");
      const ids = await ingestLead(lead);
      const { score, research } = await researchAndScore(ids.contactId, ids.dealId, lead);
      const deal = await hubspot.getDeal(ids.dealId);
      return ok({
        contactId: ids.contactId,
        dealId: ids.dealId,
        newDeal: ids.isNew,
        stage: deal.properties.ehub_stage,
        score,
        recommended_service: research.recommended_service_id,
        next_action: research.recommended_next_action,
        personalization_hook: research.personalization_hook,
        summary: research.summary,
        hubspot_link: hubspot.dealUrl(ids.dealId),
      });
    }

    case "run_reminders":
      return ok(await runReminders());

    case "run_followups":
      return ok(await runFollowUps());

    default:
      return bad("Unknown action");
  }
});
