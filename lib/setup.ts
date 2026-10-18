/** Milestone 1 — create the "Ehub Automation" property group and custom properties in HubSpot. Safe to re-run. */
import { hs } from "./hubspot";
import { CONTACT_PROPERTIES, DEAL_PROPERTIES, PropDef } from "./schema";

const label = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function tryCreate(path: string, body: unknown): Promise<"created" | "exists" | string> {
  try {
    await hs(path, { method: "POST", body });
    return "created";
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("→ 409")) return "exists";
    return `error: ${msg.replace(/^HubSpot POST \S+ → /, "").slice(0, 300)}`;
  }
}

async function setupObject(object: "contacts" | "deals", props: PropDef[]) {
  const group = await tryCreate(`/crm/v3/properties/${object}/groups`, {
    name: "ehub_automation",
    label: "Ehub Automation",
    displayOrder: -1,
  });
  const results: Record<string, string> = {};
  for (const p of props) {
    results[p.name] = await tryCreate(`/crm/v3/properties/${object}`, {
      name: p.name,
      label: p.label,
      type: p.type,
      fieldType: p.fieldType,
      groupName: "ehub_automation",
      ...(p.options ? { options: p.options.map((v, i) => ({ label: label(v), value: v, displayOrder: i })) } : {}),
    });
  }
  return { group, properties: results };
}

export async function setupHubspot() {
  const contacts = await setupObject("contacts", CONTACT_PROPERTIES);
  const deals = await setupObject("deals", DEAL_PROPERTIES);
  const all = [contacts.group, deals.group, ...Object.values(contacts.properties), ...Object.values(deals.properties)];
  return {
    summary: {
      created: all.filter((s) => s === "created").length,
      already_existed: all.filter((s) => s === "exists").length,
      errors: all.filter((s) => s.startsWith("error")).length,
    },
    contacts,
    deals,
  };
}
