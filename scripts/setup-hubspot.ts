/**
 * Milestone 1 — CRM Foundation.
 * Creates the "Ehub Automation" property group and every custom property on contacts and deals.
 * Safe to re-run: existing properties are skipped.
 *
 *   HUBSPOT_TOKEN=pat-xxx npm run setup:hubspot
 */
import { CONTACT_PROPERTIES, DEAL_PROPERTIES, PropDef } from "../lib/schema";

const token = process.env.HUBSPOT_TOKEN;
if (!token) { console.error("Set HUBSPOT_TOKEN first"); process.exit(1); }

async function hs(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const label = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function setup(object: "contacts" | "deals", props: PropDef[]) {
  const g = await hs(`/crm/v3/properties/${object}/groups`, "POST", { name: "ehub_automation", label: "Ehub Automation", displayOrder: -1 });
  console.log(`[${object}] group: ${g.status === 201 ? "created" : g.status === 409 ? "exists" : `HTTP ${g.status} ${JSON.stringify(g.data)}`}`);
  for (const p of props) {
    const r = await hs(`/crm/v3/properties/${object}`, "POST", {
      name: p.name,
      label: p.label,
      type: p.type,
      fieldType: p.fieldType,
      groupName: "ehub_automation",
      ...(p.options ? { options: p.options.map((v, i) => ({ label: label(v), value: v, displayOrder: i })) } : {}),
    });
    console.log(`[${object}] ${p.name}: ${r.status === 201 ? "created" : r.status === 409 ? "exists" : `ERROR ${r.status} ${r.data?.message ?? ""}`}`);
  }
}

(async () => {
  await setup("contacts", CONTACT_PROPERTIES);
  await setup("deals", DEAL_PROPERTIES);
  console.log("\nDone. Next: map your deal stages with HUBSPOT_STAGE_MAP if you don't use the default Sales Pipeline.");
})();
