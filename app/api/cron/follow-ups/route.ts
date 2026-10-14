/** 07 — daily: engagement-checked, adaptive proposal follow-ups. */
import { cron } from "@/lib/route";
import { runFollowUps } from "@/lib/workflows/07-follow-up";

export const maxDuration = 300;
export const GET = cron(runFollowUps);
