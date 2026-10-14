# Ehub AI Sales Automation — Vercel edition

The n8n architecture from the deck, rebuilt as a Next.js app that deploys to Vercel.
**HubSpot stores the state · this app executes the workflow · Claude adds judgment and personalization.**

| # | Sub-workflow | Trigger | Endpoint |
|---|---|---|---|
| 01 | Lead Acquisition — CRM → AI research → score | Webhook | `POST /api/leads`, `POST /api/leads/meta` |
| 02 | Meeting Booking — personalized confirmation + prep questions | Cal.com / Calendly webhook | `POST /api/meetings/booked` |
| 03 | Meeting Reminder — today's discovery calls | Cron 07:00 WAT | `/api/cron/reminders` |
| 04 | Meeting Intelligence — transcript → CRM → post-call email | Transcript webhook | `POST /api/meetings/transcript` |
| 05 | Proposal Generator — AI → Google Doc → PDF → Drive → **team approval** | Auto after 04 | `POST /api/proposals/generate`, `/api/proposals/approve` |
| 06 | Proposal Meeting — reminder with Meet + proposal link, AI decision from transcript | Cron + transcript | same as 03 / 04 |
| 07 | Follow-Up Agent — 4 emails, engagement check before each | Cron 09:00 WAT + reply webhook | `/api/cron/follow-ups`, `POST /api/events/reply` |
| 08 | Deal Closure — Won → onboarding · Lost → reason + win-back · Pending → 07 | Auto / manual | `POST /api/deals/decision` |

Every state change is written to the deal (`ehub_stage` + HubSpot pipeline stage) and logged as a note on the timeline.

## Guardrails built in
- **Pricing control:** the AI only picks service IDs from `data/catalog.json`; amounts are calculated in code. Invented services are rejected.
- **Team approval:** proposals sit in `pending_approval` until someone clicks *Approve*; the proposal link only goes to the prospect after that.
- **No blind follow-ups:** before every email the app checks stage, decision, replies and scheduled meetings, and stops the sequence if anything changed. After email 4 → nurture.
- **Idempotent reminders**, signed approval links, webhook secret, cron secret, `DRY_RUN` mode.

## Deploy (about 30 minutes)

1. **HubSpot** — Settings → Integrations → Private Apps → create one with contacts + deals read/write and schema write scopes. Then create the custom fields (Milestone 1):
   ```bash
   npm install
   HUBSPOT_TOKEN=pat-xxx npm run setup:hubspot
   ```
2. **Email** — create a [Resend](https://resend.com) account, verify your sending domain, copy the API key.
3. **Claude** — API key from console.anthropic.com.
4. **Google (proposals)** — make a Google Doc from `proposal-template.md`, plus a *Proposals* and a *Clients* folder.
   - Personal Gmail: create an OAuth client in Google Cloud (Drive + Docs APIs enabled), get a refresh token (e.g. via OAuth Playground) → `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`.
   - Google Workspace: a service account works too, but the folders must be in a Shared Drive the service account belongs to.
   - Skip this and proposals are saved as a note on the HubSpot deal instead.
5. **Deploy** — push this folder to GitHub, import it in Vercel, paste the variables from `.env.example` into Project → Settings → Environment Variables. Keep `DRY_RUN=true` for the first run.
6. **Connect the triggers** (send `x-ehub-secret: <WEBHOOK_SECRET>` header, or add `?secret=...` to the URL):
   - Website form / LinkedIn / referrals → `POST /api/leads` with `{ name, email, company, website, phone, source, campaign, message }`
   - Meta Lead Ads → webhook URL `/api/leads/meta` (uses `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`)
   - Cal.com or Calendly → `/api/meetings/booked`. Event names/slugs containing "proposal" are treated as proposal calls; everything else as discovery.
   - Fireflies / tl;dv / Read.ai (via Zapier or Make) → `/api/meetings/transcript` with `{ email, transcript, meeting_type }`
   - Prospect replies (Gmail → Zapier/Make, or Resend inbound) → `/api/events/reply` with `{ email, text }`
7. Open the deployment URL — the status page shows which integrations are live. Run a test lead, check HubSpot, then set `DRY_RUN=false`.

## Before going live
- **Templates:** `lib/templates.ts` holds every email. Paste your approved template wording into each function; the AI only fills the personalised paragraph.
- **Catalogue:** `data/catalog.json` has placeholder services and prices — replace with Ehub's real ones.
- **Pipeline:** if you don't use HubSpot's default Sales Pipeline, set `HUBSPOT_STAGE_MAP` to your stage IDs.
- **Cron frequency:** Vercel Hobby runs crons once a day, which is what this uses. A "15 minutes before the call" reminder would need Pro (hourly or more often).

## Test locally
```bash
npm test     # runs all 8 workflows end-to-end against a fake HubSpot and mocked Claude
npm run dev  # http://localhost:3000
```
