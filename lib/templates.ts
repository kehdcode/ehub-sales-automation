/**
 * THE COMMUNICATION LAYER (deck slide 1).
 *
 * Every email the automation sends lives here. The fixed wording is yours to edit —
 * paste your approved template copy into each function. The AI only fills the
 * `personal` paragraphs, so tone and promises stay under your control.
 */
import { config } from "./config";

export interface Rendered { subject: string; html: string; }

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const para = (s: string | null | undefined) =>
  s ? esc(s).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("") : "";

const button = (href: string, label: string) =>
  `<p><a href="${esc(href)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;

function layout(body: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:600px">${body}<p>Best regards,<br>${esc(config.senderName)}<br>${esc(config.companyName)}</p></div>`;
}

const hi = (firstName?: string | null) => `<p>Hi ${esc(firstName || "there")},</p>`;

// ─── 02 Discovery confirmation ─────────────────────────────
export function discoveryConfirmation(v: { firstName?: string | null; when: string; meetLink?: string | null; personal: string }): Rendered {
  return {
    subject: `Confirmed: our discovery call on ${v.when.split(",").slice(0, 2).join(",")}`,
    html: layout(`${hi(v.firstName)}
<p>Thanks for booking a discovery call with ${esc(config.companyName)}. We're confirmed for <b>${esc(v.when)}</b>.</p>
${para(v.personal)}
<p>On the call we'll get to know your business, where you want to take it, and whether we're the right partner to help you get there.</p>
<p>To make the most of our time, please come ready to talk about:</p>
<ol>
<li>Your single most important business goal for the next 12 months</li>
<li>Your biggest challenges with acquiring and retaining customers</li>
<li>What you're looking for in a marketing partner</li>
</ol>
${v.meetLink ? button(v.meetLink, "Join the call") : ""}`),
  };
}

// ─── 03 Discovery reminder (morning of the call) ───────────
export function discoveryReminder(v: { firstName?: string | null; when: string; meetLink?: string | null }): Rendered {
  return {
    subject: "Reminder: our discovery call is today",
    html: layout(`${hi(v.firstName)}
<p>A quick reminder that we're speaking today, <b>${esc(v.when)}</b>.</p>
<p>If you have a moment beforehand, think about your main 12-month goal, your customer acquisition and retention challenges, and what you want from a marketing partner.</p>
${v.meetLink ? button(v.meetLink, "Join the call") : ""}
<p>Looking forward to it.</p>`),
  };
}

// ─── 04 Post-discovery ─────────────────────────────────────
export function postDiscovery(v: { firstName?: string | null; personal: string; proposalCallWhen?: string | null }): Rendered {
  return {
    subject: "Thank you for the conversation — next steps",
    html: layout(`${hi(v.firstName)}
<p>Thank you for taking the time to speak with us. It was great learning about your business.</p>
${para(v.personal)}
<p>Based on our conversation, we'll prepare a tailored proposal built around your goals and challenges${
      v.proposalCallWhen ? `, which we'll walk you through on our proposal call on <b>${esc(v.proposalCallWhen)}</b>` : ", and we'll share it with you on a proposal call"
    }.</p>
<p>If anything comes to mind in the meantime, just reply to this email.</p>`),
  };
}

// ─── 06 Proposal meeting reminder ──────────────────────────
export function proposalReminder(v: { firstName?: string | null; when: string; meetLink?: string | null; proposalUrl?: string | null }): Rendered {
  return {
    subject: "Today: your proposal walkthrough",
    html: layout(`${hi(v.firstName)}
<p>Just a reminder that we're meeting today, <b>${esc(v.when)}</b>, to share the proposal we've put together for you and answer any questions you have.</p>
${v.meetLink ? button(v.meetLink, "Join the call") : ""}
${v.proposalUrl ? `<p>If you'd like a head start, you can view the proposal here: <a href="${esc(v.proposalUrl)}">${esc(v.proposalUrl)}</a></p>` : ""}
<p>See you soon.</p>`),
  };
}

// ─── 07 Follow-up sequence (four emails) ───────────────────
export const FOLLOW_UP_SUBJECTS = [
  "Still thinking about our proposal?",
  "A few more thoughts on our proposal",
  "A little nudge",
  "The decision is yours",
];

export function followUp(step: number, v: { firstName?: string | null; personal: string; proposalUrl?: string | null }): Rendered {
  const link = v.proposalUrl ? `<p>Here's the proposal again for easy reference: <a href="${esc(v.proposalUrl)}">view proposal</a></p>` : "";
  const bodies = [
    `<p>I wanted to check in on the proposal we shared. Have you had a chance to look through it?</p>${para(v.personal)}${link}<p>Happy to answer any questions or adjust anything that doesn't quite fit.</p>`,
    `<p>Since we last spoke, I've been thinking more about your plans.</p>${para(v.personal)}${link}<p>If it would help, we can jump on a short call to go through any part of it.</p>`,
    `<p>Just a gentle nudge on our proposal — I know things get busy.</p>${para(v.personal)}${link}<p>A one-line reply letting me know where things stand would be really helpful.</p>`,
    `<p>I don't want to crowd your inbox, so this will be my last note on the proposal for now.</p>${para(v.personal)}${link}<p>Whatever you decide, it was a pleasure learning about your business. If the timing is better later, my door is always open.</p>`,
  ];
  return { subject: FOLLOW_UP_SUBJECTS[step - 1], html: layout(`${hi(v.firstName)}${bodies[step - 1]}`) };
}

// ─── 08 Onboarding ─────────────────────────────────────────
export function onboarding(v: { firstName?: string | null; company?: string | null }): Rendered {
  return {
    subject: `Welcome to ${config.companyName}! Here's what happens next`,
    html: layout(`${hi(v.firstName)}
<p>We're excited to start working with ${esc(v.company || "you")}! Welcome aboard.</p>
<p>Here's what happens next:</p>
<ol>
<li>Our team will reach out within one business day to schedule your kickoff session.</li>
<li>We'll share a short onboarding form so we can access the tools and information we need.</li>
<li>At kickoff we'll confirm priorities, timelines and how we'll report progress.</li>
</ol>
<p>If you have any questions before then, just reply here.</p>`),
  };
}

// ─── Internal team emails ──────────────────────────────────
export function teamHotLead(v: { name: string; company: string; score: number; summary: string; service: string; dealUrl: string }): Rendered {
  return {
    subject: `🔥 Hot lead (${v.score}): ${v.company || v.name}`,
    html: `<p><b>${esc(v.name)}</b> — ${esc(v.company)}</p><p>Score: <b>${v.score}</b> · Recommended: ${esc(v.service)}</p>${para(v.summary)}<p><a href="${esc(v.dealUrl)}">Open in HubSpot</a></p>`,
  };
}

export function teamApproval(v: { company: string; amount: string; summary: string; docUrl?: string | null; approveUrl: string }): Rendered {
  return {
    subject: `Proposal ready for approval: ${v.company} (${v.amount})`,
    html: `<p>A proposal has been drafted for <b>${esc(v.company)}</b>.</p><p>Investment: <b>${esc(v.amount)}</b></p>${para(v.summary)}
${v.docUrl ? `<p><a href="${esc(v.docUrl)}">Review the Google Doc</a> (edit it directly if needed)</p>` : ""}
${button(v.approveUrl, "Review & approve")}`,
  };
}

export function teamWon(v: { company: string; amount: string; folderUrl?: string | null; dealUrl: string }): Rendered {
  return {
    subject: `🎉 Closed won: ${v.company} (${v.amount})`,
    html: `<p><b>${esc(v.company)}</b> said yes! Onboarding has started automatically.</p>${v.folderUrl ? `<p>Client folder: <a href="${esc(v.folderUrl)}">${esc(v.folderUrl)}</a></p>` : ""}<p><a href="${esc(v.dealUrl)}">Open deal in HubSpot</a></p>`,
  };
}
