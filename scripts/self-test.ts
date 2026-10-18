/**
 * End-to-end test of all 8 sub-workflows against an in-memory HubSpot and a mocked Claude API.
 * No real accounts are touched.   npm test
 */
process.env.HUBSPOT_TOKEN = "test";
process.env.ANTHROPIC_API_KEY = "test";
process.env.DRY_RUN = "true";
process.env.WEBHOOK_SECRET = "secret";
process.env.TEAM_EMAILS = "team@ehub.test";
process.env.TIMEZONE = "Africa/Lagos";

import assert from "node:assert/strict";

// ─── In-memory HubSpot ─────────────────────────────────────
type Obj = { id: string; properties: Record<string, string | null> };
const db: Record<string, Map<string, Obj>> = { contacts: new Map(), deals: new Map(), notes: new Map(), tasks: new Map() };
const assoc: [string, string, string, string][] = []; // fromType, fromId, toType, toId
let nextId = 1000;
const newId = () => String(nextId++);
const emails: string[] = [];

function link(aType: string, aId: string, bType: string, bId: string) {
  assoc.push([aType, aId, bType, bId], [bType, bId, aType, aId]);
}
function matches(o: Obj, f: any) {
  const v = o.properties[f.propertyName];
  switch (f.operator) {
    case "EQ": return v === f.value;
    case "LTE": return v !== null && v !== undefined && v !== "" && Number(v) <= Number(f.value);
    case "BETWEEN": return v !== null && v !== undefined && v !== "" && Number(v) >= Number(f.value) && Number(v) <= Number(f.highValue);
    default: throw new Error(`op ${f.operator}`);
  }
}

async function fakeHubspot(url: URL, method: string, body: any): Promise<any> {
  const path = url.pathname;
  let m;
  if (path === "/crm/v3/objects/contacts/batch/upsert") {
    const input = body.inputs[0];
    let c = [...db.contacts.values()].find((x) => x.properties.email === input.id);
    if (!c) { c = { id: newId(), properties: {} }; db.contacts.set(c.id, c); }
    Object.assign(c.properties, input.properties);
    return { results: [c] };
  }
  if ((m = path.match(/^\/crm\/v3\/objects\/(contacts|deals)\/search$/))) {
    const list = [...db[m[1]].values()].filter((o) => body.filterGroups[0].filters.every((f: any) => matches(o, f)));
    return { results: list };
  }
  if ((m = path.match(/^\/crm\/v4\/objects\/(\w+)\/(\d+)\/associations\/(\w+)$/))) {
    return { results: assoc.filter((a) => a[0] === m![1] && a[1] === m![2] && a[2] === m![3]).map((a) => ({ toObjectId: a[3] })) };
  }
  if ((m = path.match(/^\/crm\/v3\/objects\/(\w+)\/(\d+)$/))) {
    const o = db[m[1]].get(m[2]);
    if (!o) throw new Error(`404 ${path}`);
    if (method === "PATCH") Object.assign(o.properties, body.properties);
    return o;
  }
  if ((m = path.match(/^\/crm\/v3\/objects\/(\w+)$/)) && method === "POST") {
    const o = { id: newId(), properties: { ...body.properties } };
    db[m[1]].set(o.id, o);
    for (const a of body.associations ?? []) {
      const toType = a.types[0].associationTypeId === 3 ? "contacts" : "deals";
      link(m[1], o.id, toType, a.to.id);
    }
    return o;
  }
  throw new Error(`Unmocked HubSpot ${method} ${path}`);
}

// ─── Mocked Claude: canned structured outputs per tool ─────
const AI: Record<string, any> = {
  save_prospect_research: {
    industry: "Fintech", target_audience: "SMEs in Lagos", pain_points: ["Low brand awareness"], business_goals: ["Grow to 10k users"],
    decision_maker: "likely", marketing_opportunities: ["Founder-led LinkedIn content"], lead_score: 82, score_reasoning: "Strong fit.",
    recommended_service_id: "growth-strategy-sprint", recommended_next_action: "Book discovery call", personalization_hook: "Your invoice-financing feature for SMEs", summary: "Promising fintech startup.",
  },
  write_paragraph: { paragraph: "I noticed your invoice-financing feature for SMEs — impressive." },
  save_discovery: {
    main_challenge: "CAC is too high", business_goal: "10k active SMEs in 12 months", acquisition_retention_problems: "Paid ads unprofitable",
    desired_services: "Strategy and paid acquisition", budget: "$10k", timeline: "Start next month", decision_maker_status: "Founder decides",
    objections: ["Past agency disappointed"], next_step: "Proposal call", summary_for_prospect: "You want to reach 10k SMEs while bringing CAC down.",
  },
  save_proposal: {
    selections: [
      { service_id: "growth-strategy-sprint", why: "Fix positioning first" },
      { service_id: "paid-acquisition", months: 6, why: "Scale efficiently" },
      { service_id: "made-up-service", why: "should be rejected" },
    ],
    executive_summary: "Summary", current_situation: "Situation", strategy: "Strategy", timeline: "Timeline", kpis: "KPIs", next_steps: "Next",
  },
  save_decision: { decision: "pending", reason: "Needs co-founder sign-off", objections: [], next_action: "Follow up", confidence: 0.8 },
  save_reply_intent: { intent: "accepted", summary: "They want to go ahead." },
};

// which canned answer goes with which agent (matched on the task description in the system prompt)
const TASKS: Record<string, string> = {
  save_prospect_research: "Save research and qualification",
  write_paragraph: "Return the paragraph",
  save_discovery: "Save structured intelligence from a discovery call",
  save_proposal: "Save the proposal draft",
  save_decision: "Classify where the prospect stands",
  save_reply_intent: "Classify a prospect's email reply",
};

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  const method = init.method ?? (typeof input === "object" && input.method) ?? "GET";
  const rawBody = init.body ?? (typeof input === "object" && "text" in input ? await input.text() : undefined);
  const body = rawBody ? JSON.parse(String(rawBody)) : undefined;
  const json = (d: any) => new Response(JSON.stringify(d), { status: 200, headers: { "content-type": "application/json" } });
  if (url.hostname === "api.hubapi.com") return json(await fakeHubspot(url, method, body));
  if (url.hostname === "api.anthropic.com") {
    assert.ok(body.output_config?.format?.type === "json_schema", "uses structured outputs");
    assert.ok(!body.tool_choice, "no forced tool_choice");
    const tool = Object.keys(AI).find((k) => body.system.includes(TASKS[k]))!;
    return json({
      id: "msg_test", type: "message", role: "assistant", model: body.model, stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "text", text: JSON.stringify(AI[tool]) }],
    });
  }
  if (url.hostname.includes("prospect.test")) return new Response("<title>Prospect</title><p>Invoice financing for SMEs</p>");
  return realFetch(input, init);
}) as typeof fetch;

// capture dry-run emails
const log = console.log;
console.log = (...a: any[]) => { const s = a.join(" "); if (s.startsWith("[DRY_RUN]")) emails.push(s); else log(...a); };

async function main() {
  const { priceSelections } = await import("../lib/catalog");
  const { todayBounds, tzOffsetMinutes } = await import("../lib/time");
  const { normalizeBooking, handleBooking } = await import("../lib/workflows/02-meeting-booking");
  const { ingestLead, researchAndScore, toLead } = await import("../lib/workflows/01-lead-acquisition");
  const { runReminders } = await import("../lib/workflows/03-06-reminders");
  const { handleTranscript } = await import("../lib/workflows/04-meeting-intelligence");
  const { approveProposal } = await import("../lib/workflows/05-proposal");
  const { runFollowUps, handleReply } = await import("../lib/workflows/07-follow-up");
  const { signToken, verifyToken } = await import("../lib/auth");

  const step = (n: string) => log(`✓ ${n}`);

  // Pure logic
  const priced = priceSelections([{ service_id: "paid-acquisition", months: 5 }, { service_id: "nope" }, { service_id: "crm-automation" }]);
  assert.equal(priced.lines[0].months, 3, "invalid term falls back to first allowed term");
  assert.deepEqual(priced.rejected, ["nope"]);
  assert.equal(priced.total, 1200 * 3 + 1800);
  assert.equal(tzOffsetMinutes("Africa/Lagos"), 60);
  const b = todayBounds("Africa/Lagos", new Date("2026-10-14T23:30:00Z")); // 00:30 on the 15th in Lagos
  assert.equal(new Date(b.start).toISOString(), "2026-10-14T23:00:00.000Z");
  assert.ok(verifyToken("approve:1", signToken("approve:1")) && !verifyToken("approve:2", signToken("approve:1")));
  step("pricing control, timezone bounds, signed approval tokens");

  // 01 Lead acquisition
  const lead = toLead({ name: "Ada Obi", email: "Ada@Prospect.test", company: "PayFlow", website: "prospect.test", source: "meta_ads" })!;
  const ids = await ingestLead(lead);
  await researchAndScore(ids.contactId, ids.dealId, lead);
  const contact = db.contacts.get(ids.contactId)!;
  assert.equal(contact.properties.email, "ada@prospect.test");
  assert.equal(contact.properties.ehub_lead_score, "82");
  assert.equal(db.deals.get(ids.dealId)!.properties.ehub_stage, "qualified");
  assert.ok(emails.some((e) => e.includes("Hot lead")), "hot lead team alert");
  const again = await ingestLead(lead);
  assert.equal(again.dealId, ids.dealId, "duplicate lead re-uses the open deal");
  step("01 lead → HubSpot → AI research → score → hot-lead alert (no duplicate deal)");

  // 02 Booking (Cal.com payload) for a call today
  const { start } = todayBounds("Africa/Lagos");
  const callMs = start + 14 * 3600_000; // 14:00 Lagos today
  const calcom = { triggerEvent: "BOOKING_CREATED", payload: { type: "discovery-call", startTime: new Date(callMs).toISOString(), attendees: [{ email: "ada@prospect.test", name: "Ada Obi" }], metadata: { videoCallUrl: "https://meet.google.com/abc" } } };
  const booking = normalizeBooking(calcom)!;
  assert.equal(booking.type, "discovery");
  await handleBooking(booking);
  const deal = db.deals.get(ids.dealId)!;
  assert.equal(deal.properties.ehub_stage, "discovery_booked");
  assert.ok(emails.some((e) => e.includes("Confirmed: our discovery call") && e.includes("invoice-financing")), "personalized confirmation");
  assert.ok(emails.some((e) => e.includes("12 months")), "three preparation questions included");
  step("02 booking → personalized confirmation with prep questions → CRM");

  // 03 Reminder cron — idempotent
  let r = await runReminders();
  assert.equal(r.discovery[0].status, "sent");
  r = await runReminders();
  assert.equal(r.discovery[0].status, "already_sent");
  step("03 morning reminder sent once (idempotent)");

  // 04 Discovery transcript → CRM + post-call email + 05 proposal draft
  await handleTranscript({ email: "ada@prospect.test", transcript: "x".repeat(200), meeting_type: "discovery" });
  assert.equal(deal.properties.ehub_challenge, "CAC is too high");
  assert.ok(emails.some((e) => e.includes("Thank you for the conversation") && e.includes("10k SMEs")));
  assert.equal(deal.properties.ehub_stage, "proposal_draft");
  assert.equal(deal.properties.ehub_proposal_status, "pending_approval");
  assert.equal(deal.properties.ehub_proposal_amount, String(2500 + 1200 * 6), "price computed from catalogue, invented service rejected");
  assert.ok(emails.some((e) => e.includes("Proposal ready for approval")));
  step("04 transcript → structured CRM data → post-call email; 05 proposal priced from catalogue → team approval");

  // Approval + proposal meeting booking + reminder
  await approveProposal(ids.dealId, true);
  assert.equal(deal.properties.ehub_stage, "proposal_approved");
  deal.properties.ehub_proposal_pdf_url = "https://drive.test/proposal.pdf";
  await handleBooking({ action: "created", type: "proposal", email: "ada@prospect.test", startMs: callMs + 3600_000, meetLink: "https://meet.google.com/xyz" });
  assert.equal(deal.properties.ehub_stage, "proposal_meeting");
  r = await runReminders();
  assert.equal(r.proposal[0].status, "sent");
  assert.ok(emails.some((e) => e.includes("proposal walkthrough") && e.includes("drive.test/proposal.pdf")));
  step("06 approval → proposal call booked → reminder with Meet + proposal link");

  // Proposal call → PENDING → 07 follow-up sequence
  await handleTranscript({ email: "ada@prospect.test", transcript: "y".repeat(200), meeting_type: "proposal" });
  assert.equal(deal.properties.ehub_stage, "follow_up");
  assert.equal(deal.properties.ehub_sequence_status, "active");
  let res = await runFollowUps();
  assert.equal(res.length, 0, "nothing due before the first interval");
  deal.properties.ehub_next_followup = String(Date.now() - 1000);
  res = await runFollowUps();
  assert.equal(res[0].status, "sent_1");
  assert.ok(emails.some((e) => e.includes("Still thinking about our proposal?")));
  step("06 proposal call → AI decision PENDING → 07 sequence starts, email 1 only when due");

  // Reply detected by HubSpot → sequence stops instead of sending email 2
  deal.properties.ehub_next_followup = String(Date.now() - 1000);
  contact.properties.hs_sales_email_last_replied = String(Date.now() + 1000); // reply arrives after our email
  res = await runFollowUps();
  assert.match(res[0].status, /stopped: prospect replied/);
  assert.equal(deal.properties.ehub_sequence_status, "stopped");
  assert.ok(!emails.some((e) => e.includes("A few more thoughts")), "email 2 not sent after reply");
  step("07 engagement check stops the sequence when the prospect replies");

  // Reply says yes → 08 WON → onboarding
  await handleReply("Ada Obi <ada@prospect.test>".match(/[^\s<>]+@[^\s<>]+/)![0], "Let's go ahead, please send the invoice.");
  assert.equal(deal.properties.ehub_stage, "won");
  assert.equal(deal.properties.dealstage, "closedwon");
  assert.ok(emails.some((e) => e.includes("Welcome to Ehub")));
  assert.ok(emails.some((e) => e.includes("Closed won")));
  assert.ok([...db.tasks.values()].some((t) => t.properties.hs_task_subject?.includes("onboarding")));
  step("08 accepted reply → Closed Won → onboarding email, team alert, kickoff task");

  // Full no-response path → nurture, and LOST path
  const ids2 = await ingestLead({ email: "silent@prospect.test", company: "Quiet Co" });
  const { applyDecision } = await import("../lib/workflows/08-deal-closure");
  await applyDecision(ids2.dealId, "pending");
  const d2 = db.deals.get(ids2.dealId)!;
  for (let i = 1; i <= 5; i++) { d2.properties.ehub_next_followup = String(Date.now() - 1000); await runFollowUps(); }
  assert.equal(d2.properties.ehub_followup_step, "4");
  assert.equal(d2.properties.ehub_stage, "nurture");
  assert.equal(d2.properties.ehub_sequence_status, "completed");
  assert.ok(emails.some((e) => e.includes("The decision is yours")));
  const ids3 = await ingestLead({ email: "no@prospect.test" });
  await applyDecision(ids3.dealId, "lost", "Chose another agency");
  const d3 = db.deals.get(ids3.dealId)!;
  assert.equal(d3.properties.ehub_stage, "lost");
  assert.ok(d3.properties.ehub_winback_date);
  step("07 four emails then nurture; 08 LOST captures reason + win-back date");

  const notes = [...db.notes.values()].length;
  assert.ok(notes > 15);
  log(`\nAll checks passed — ${emails.length} emails generated, ${notes} CRM notes logged.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
