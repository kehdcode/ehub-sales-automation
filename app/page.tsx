import { integrationStatus } from "@/lib/config";

export const dynamic = "force-dynamic";

const WORKFLOWS = [
  ["01", "Lead Acquisition", "Source → CRM → AI research → score", "POST /api/leads · POST /api/leads/meta"],
  ["02", "Meeting Booking", "Booking → personalized confirmation → CRM", "POST /api/meetings/booked"],
  ["03", "Meeting Reminder", "Today's meetings → reminder email", "Cron 07:00 WAT · /api/cron/reminders"],
  ["04", "Meeting Intelligence", "Transcript → AI → CRM → post-call email", "POST /api/meetings/transcript"],
  ["05", "Proposal Generator", "Discovery data → AI → Docs → PDF → Drive → team approval", "auto after 04 · POST /api/proposals/generate"],
  ["06", "Proposal Meeting", "Calendar → reminder → proposal link → AI decision", "Cron · /api/cron/reminders · transcript"],
  ["07", "Follow-Up Agent", "Proposal → engagement check → adaptive sequence", "Cron 09:00 WAT · /api/cron/follow-ups · POST /api/events/reply"],
  ["08", "Deal Closure", "Won / Pending / Lost → onboarding or nurture", "auto · POST /api/deals/decision"],
];

export default function Home() {
  const s = integrationStatus();
  const items: [string, boolean][] = [
    ["HubSpot", s.hubspot], ["Claude (AI)", s.anthropic], ["Email (Resend)", s.email],
    ["Google Docs/Drive", s.google], ["Meta Lead Ads", s.meta], ["Webhook secret", s.webhookSecret], ["Cron secret", s.cronSecret],
  ];
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 16px" }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>Ehub AI Sales Automation</h1>
      <p style={{ color: "#475569", marginTop: 6 }}>HubSpot stores the state · this app executes the workflow · Claude adds judgment and personalization.</p>
      {s.dryRun && (
        <p style={{ background: "#fef3c7", border: "1px solid #fcd34d", padding: "10px 14px", borderRadius: 8 }}>
          <b>DRY_RUN is on</b> — emails are logged, not sent. Set <code>DRY_RUN=false</code> to go live.
        </p>
      )}
      <h2 style={{ fontSize: 18, marginTop: 28 }}>Integrations</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map(([name, on]) => (
          <span key={name} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 14, background: on ? "#dcfce7" : "#f1f5f9", color: on ? "#166534" : "#64748b" }}>
            {on ? "●" : "○"} {name}
          </span>
        ))}
      </div>
      <h2 style={{ fontSize: 18, marginTop: 28 }}>Sub-workflows</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {WORKFLOWS.map(([n, name, flow, endpoint]) => (
          <div key={n} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontWeight: 700, color: "#2563eb" }}>{n} · {name}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>{flow}</div>
            <code style={{ fontSize: 12, color: "#64748b" }}>{endpoint}</code>
          </div>
        ))}
      </div>
    </main>
  );
}
