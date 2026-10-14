/** 01 Lead Acquisition — Meta Lead Ads webhook (Page subscription, field: leadgen). */
import { createHmac, timingSafeEqual } from "crypto";
import { optEnv, env } from "@/lib/config";
import { ok, bad, background } from "@/lib/route";
import { ingestLead, researchAndScore, LeadInput } from "@/lib/workflows/01-lead-acquisition";

export const maxDuration = 60;

// Meta's verification handshake
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === optEnv("META_VERIFY_TOKEN")) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null) {
  const secret = optEnv("META_APP_SECRET");
  if (!secret || !header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return expected.length === header.length && timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

async function fetchLead(leadgenId: string): Promise<LeadInput | null> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?access_token=${encodeURIComponent(env("META_PAGE_ACCESS_TOKEN"))}`);
  if (!res.ok) throw new Error(`Meta lead fetch failed ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { field_data?: { name: string; values: string[] }[]; campaign_name?: string; ad_name?: string };
  const f = Object.fromEntries((data.field_data ?? []).map((x) => [x.name.toLowerCase(), x.values?.[0] ?? ""]));
  if (!f.email) return null;
  const [first, ...rest] = (f.full_name ?? "").split(/\s+/);
  return {
    email: f.email,
    firstname: f.first_name || first,
    lastname: f.last_name || rest.join(" "),
    phone: f.phone_number,
    company: f.company_name,
    website: f.website ?? f.company_website,
    jobtitle: f.job_title,
    source: "meta_ads",
    campaign: data.campaign_name ?? data.ad_name,
    extra: f,
  };
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return bad("invalid signature", 401);
  const body = JSON.parse(raw);
  const ids: string[] = [];
  for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
    if (ch.field === "leadgen" && ch.value?.leadgen_id) ids.push(String(ch.value.leadgen_id));
  }
  // Acknowledge fast; Meta retries slow webhooks.
  background("meta-leads", async () => {
    for (const id of ids) {
      const lead = await fetchLead(id);
      if (!lead) continue;
      const r = await ingestLead(lead);
      await researchAndScore(r.contactId, r.dealId, lead);
    }
  });
  return ok({ received: ids.length });
}
