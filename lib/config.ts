export function env(key: string, fallback?: string): string {
  const v = process.env[key] || fallback;
  if (v === undefined || v === "") throw new Error(`Missing environment variable ${key}`);
  return v;
}

export function optEnv(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() !== "" ? v : undefined;
}

export const config = {
  get timezone() { return optEnv("TIMEZONE") ?? "Africa/Lagos"; },
  get dryRun() { return optEnv("DRY_RUN") === "true"; },
  get hotLeadScore() { return Number(optEnv("HOT_LEAD_SCORE") ?? 70); },
  get followUpIntervals(): number[] {
    return (optEnv("FOLLOWUP_INTERVAL_DAYS") ?? "3,4,5,7,7").split(",").map((n) => Number(n.trim()));
  },
  get winbackDays() { return Number(optEnv("WINBACK_DAYS") ?? 90); },
  get appUrl() { return (optEnv("APP_URL") ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, ""); },
  get teamEmails(): string[] { return (optEnv("TEAM_EMAILS") ?? "").split(",").map((s) => s.trim()).filter(Boolean); },
  get senderName() { return optEnv("SENDER_NAME") ?? "The Ehub Team"; },
  get companyName() { return optEnv("COMPANY_NAME") ?? "Ehub"; },
  /** How the AI describes the business it is selling for. */
  get companyContext() {
    return (
      optEnv("COMPANY_CONTEXT") ??
      "Ehub is a growth partner that helps businesses build structure, systems and strategies for growth — marketing strategy, customer acquisition, retention, community and automation. Most clients are startups and SMEs in Nigeria and across Africa."
    );
  },
};

/** Which integrations are configured — shown on the status page. */
export function integrationStatus() {
  return {
    hubspot: !!optEnv("HUBSPOT_TOKEN"),
    anthropic: !!optEnv("ANTHROPIC_API_KEY"),
    email: !!optEnv("RESEND_API_KEY") && !!optEnv("EMAIL_FROM"),
    google:
      (!!optEnv("GOOGLE_REFRESH_TOKEN") || !!optEnv("GOOGLE_SERVICE_ACCOUNT_JSON")) &&
      !!optEnv("PROPOSAL_TEMPLATE_DOC_ID"),
    meta: !!optEnv("META_PAGE_ACCESS_TOKEN"),
    webhookSecret: !!optEnv("WEBHOOK_SECRET"),
    cronSecret: !!optEnv("CRON_SECRET"),
    dryRun: config.dryRun,
  };
}
