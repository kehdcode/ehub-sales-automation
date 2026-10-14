/** 03 + 06 — every morning: remind prospects about today's discovery and proposal calls. */
import { cron } from "@/lib/route";
import { runReminders } from "@/lib/workflows/03-06-reminders";

export const maxDuration = 300;
export const GET = cron(runReminders);
