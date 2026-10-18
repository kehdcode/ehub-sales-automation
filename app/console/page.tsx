"use client";

import { useEffect, useState } from "react";

type Result = { title: string; ok: boolean; data: unknown } | null;

const box: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginTop: 14 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #cbd5e1", borderRadius: 8, font: "inherit", marginTop: 4 };
const btn = (primary = false): React.CSSProperties => ({
  padding: "10px 16px", borderRadius: 8, border: primary ? "0" : "1px solid #cbd5e1", cursor: "pointer",
  background: primary ? "#2563eb" : "#fff", color: primary ? "#fff" : "#0f172a", fontWeight: 600, font: "inherit",
});

export default function Console() {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [lead, setLead] = useState({
    name: "Ada Test",
    email: "ada.test@example.com",
    company: "Paystack",
    website: "paystack.com",
    message: "We want to grow our SME customer base in Lagos and Abuja.",
  });

  useEffect(() => {
    try { setSecret(sessionStorage.getItem("ehub_secret") ?? ""); } catch {}
  }, []);

  async function run(action: string, title: string, extra: object = {}) {
    try { sessionStorage.setItem("ehub_secret", secret); } catch {}
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ehub-secret": secret },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setResult({ title, ok: res.ok, data: res.status === 401 ? { error: "Wrong secret — use the WEBHOOK_SECRET you set in Vercel." } : data });
    } catch (e) {
      setResult({ title, ok: false, data: { error: String(e) } });
    } finally {
      setBusy(null);
    }
  }

  const field = (key: keyof typeof lead, labelText: string) => (
    <label style={{ display: "block", fontSize: 14, marginTop: 10 }}>
      {labelText}
      <input style={input} value={lead[key]} onChange={(e) => setLead({ ...lead, [key]: e.target.value })} />
    </label>
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px" }}>
      <h1 style={{ margin: 0, fontSize: 26 }}>Test console</h1>
      <p style={{ color: "#475569", marginTop: 6 }}>Run each part of the automation by hand and see the result. With DRY_RUN on, no emails go out.</p>

      <div style={box}>
        <label style={{ display: "block", fontSize: 14, fontWeight: 600 }}>
          Webhook secret
          <input style={input} type="password" placeholder="The WEBHOOK_SECRET you set in Vercel" value={secret} onChange={(e) => setSecret(e.target.value)} />
        </label>
      </div>

      <div style={box}>
        <b>Step 1 · Create the HubSpot fields</b>
        <p style={{ fontSize: 14, color: "#475569", margin: "6px 0 12px" }}>One-time setup. Safe to run again — existing fields are skipped.</p>
        <button style={btn(true)} disabled={!!busy || !secret} onClick={() => run("setup_hubspot", "HubSpot setup")}>
          {busy === "setup_hubspot" ? "Creating…" : "Create HubSpot fields"}
        </button>
      </div>

      <div style={box}>
        <b>Step 2 · Send a test lead (workflow 01)</b>
        <p style={{ fontSize: 14, color: "#475569", margin: "6px 0 0" }}>Creates the contact and deal in HubSpot, researches the company with Claude, and scores it. Takes 20–40 seconds.</p>
        {field("name", "Name")}
        {field("email", "Email")}
        {field("company", "Company")}
        {field("website", "Website")}
        {field("message", "Message")}
        <div style={{ marginTop: 14 }}>
          <button style={btn(true)} disabled={!!busy || !secret} onClick={() => run("test_lead", "Test lead", { lead })}>
            {busy === "test_lead" ? "Researching…" : "Send test lead"}
          </button>
        </div>
      </div>

      <div style={box}>
        <b>Step 3 · Run the daily jobs now</b>
        <p style={{ fontSize: 14, color: "#475569", margin: "6px 0 12px" }}>These normally run on schedule every morning.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn()} disabled={!!busy || !secret} onClick={() => run("run_reminders", "Meeting reminders")}>
            {busy === "run_reminders" ? "Running…" : "Run meeting reminders"}
          </button>
          <button style={btn()} disabled={!!busy || !secret} onClick={() => run("run_followups", "Follow-ups")}>
            {busy === "run_followups" ? "Running…" : "Run follow-ups"}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ ...box, borderColor: result.ok ? "#86efac" : "#fca5a5", background: result.ok ? "#f0fdf4" : "#fef2f2" }}>
          <b>{result.ok ? "✓" : "✕"} {result.title}</b>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, margin: "10px 0 0" }}>{JSON.stringify(result.data, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}
