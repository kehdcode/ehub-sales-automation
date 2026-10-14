import { env, optEnv } from "./config";
import { CONTACT_PROP_NAMES, DEAL_PROP_NAMES, Stage } from "./schema";

const BASE = "https://api.hubapi.com";

// HubSpot-defined association type IDs
const DEAL_TO_CONTACT = 3;
const NOTE_TO_DEAL = 214;
const TASK_TO_DEAL = 216;

export type Props = Record<string, string | number | null | undefined>;
export interface HsObject { id: string; properties: Record<string, string | null>; }

export async function hs<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(BASE + path, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${env("HUBSPOT_TOKEN")}`, "Content-Type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`HubSpot ${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }
  throw new Error("HubSpot rate limit");
}

function clean(props: Props): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    out[k] = v === null ? "" : String(v);
  }
  return out;
}

// ─── Contacts ──────────────────────────────────────────────

export async function upsertContact(email: string, props: Props): Promise<HsObject> {
  const r = await hs<{ results: HsObject[] }>("/crm/v3/objects/contacts/batch/upsert", {
    method: "POST",
    body: { inputs: [{ id: email.toLowerCase(), idProperty: "email", properties: clean({ ...props, email: email.toLowerCase() }) }] },
  });
  return r.results[0];
}

export async function findContactByEmail(email: string): Promise<HsObject | null> {
  const r = await hs<{ results: HsObject[] }>("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email.toLowerCase() }] }],
      properties: CONTACT_PROP_NAMES,
      limit: 1,
    },
  });
  return r.results[0] ?? null;
}

export async function getContact(id: string): Promise<HsObject> {
  return hs(`/crm/v3/objects/contacts/${id}?properties=${CONTACT_PROP_NAMES.join(",")}`);
}

export async function updateContact(id: string, props: Props) {
  return hs(`/crm/v3/objects/contacts/${id}`, { method: "PATCH", body: { properties: clean(props) } });
}

// ─── Deals ─────────────────────────────────────────────────

export async function getDeal(id: string): Promise<HsObject> {
  return hs(`/crm/v3/objects/deals/${id}?properties=${DEAL_PROP_NAMES.join(",")}`);
}

export async function updateDeal(id: string, props: Props) {
  return hs(`/crm/v3/objects/deals/${id}`, { method: "PATCH", body: { properties: clean(props) } });
}

export async function createDeal(contactId: string, props: Props): Promise<HsObject> {
  return hs("/crm/v3/objects/deals", {
    method: "POST",
    body: {
      properties: clean({ pipeline: optEnv("HUBSPOT_PIPELINE_ID") ?? "default", ...props }),
      associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: DEAL_TO_CONTACT }] }],
    },
  });
}

async function associatedIds(from: "contacts" | "deals", id: string, to: "contacts" | "deals"): Promise<string[]> {
  const r = await hs<{ results: { toObjectId: number | string }[] }>(`/crm/v4/objects/${from}/${id}/associations/${to}`);
  return r.results.map((x) => String(x.toObjectId));
}

/** Most recent deal for a contact that is not closed. */
export async function openDealForContact(contactId: string): Promise<HsObject | null> {
  const ids = await associatedIds("contacts", contactId, "deals");
  const deals = await Promise.all(ids.map(getDeal));
  const open = deals
    .filter((d) => !["won", "lost"].includes(d.properties.ehub_stage ?? ""))
    .sort((a, b) => Number(b.id) - Number(a.id));
  return open[0] ?? null;
}

export async function contactForDeal(dealId: string): Promise<HsObject | null> {
  const [id] = await associatedIds("deals", dealId, "contacts");
  return id ? getContact(id) : null;
}

export async function searchDeals(
  filters: { propertyName: string; operator: string; value?: string; highValue?: string }[],
): Promise<HsObject[]> {
  const out: HsObject[] = [];
  let after: string | undefined;
  do {
    const r = await hs<{ results: HsObject[]; paging?: { next?: { after: string } } }>("/crm/v3/objects/deals/search", {
      method: "POST",
      body: { filterGroups: [{ filters }], properties: DEAL_PROP_NAMES, limit: 100, ...(after ? { after } : {}) },
    });
    out.push(...r.results);
    after = r.paging?.next?.after;
  } while (after && out.length < 1000);
  return out;
}

// ─── Activity (every state change is recorded in the CRM) ──

export async function logNote(dealId: string, body: string) {
  return hs("/crm/v3/objects/notes", {
    method: "POST",
    body: {
      properties: { hs_timestamp: new Date().toISOString(), hs_note_body: body.replace(/\n/g, "<br>") },
      associations: [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_DEAL }] }],
    },
  });
}

export async function createTask(dealId: string, subject: string, body: string, dueMs = Date.now()) {
  return hs("/crm/v3/objects/tasks", {
    method: "POST",
    body: {
      properties: {
        hs_timestamp: new Date(dueMs).toISOString(),
        hs_task_subject: subject,
        hs_task_body: body,
        hs_task_status: "NOT_STARTED",
        hs_task_priority: "HIGH",
      },
      associations: [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: TASK_TO_DEAL }] }],
    },
  });
}

function stageMap(): Partial<Record<Stage, string>> {
  const raw = optEnv("HUBSPOT_STAGE_MAP");
  if (raw) return JSON.parse(raw);
  // Defaults for HubSpot's built-in "Sales Pipeline"
  return {
    new: "appointmentscheduled",
    qualified: "appointmentscheduled",
    discovery_booked: "qualifiedtobuy",
    discovery_done: "qualifiedtobuy",
    proposal_draft: "presentationscheduled",
    proposal_approved: "presentationscheduled",
    proposal_meeting: "decisionmakerboughtin",
    follow_up: "contractsent",
    won: "closedwon",
    lost: "closedlost",
  };
}

/** Move a deal to a new automation stage, sync the HubSpot pipeline stage and log why. */
export async function setStage(dealId: string, stage: Stage, extra: Props = {}, note?: string) {
  const dealstage = stageMap()[stage];
  await updateDeal(dealId, { ehub_stage: stage, ...(dealstage ? { dealstage } : {}), ...extra });
  await logNote(dealId, `<b>Automation → ${stage}</b>${note ? `\n${note}` : ""}`);
}

export function dealUrl(dealId: string) {
  const portal = optEnv("HUBSPOT_PORTAL_ID");
  return portal
    ? `https://app.hubspot.com/contacts/${portal}/record/0-3/${dealId}`
    : `https://app.hubspot.com/ (deal ${dealId})`;
}
