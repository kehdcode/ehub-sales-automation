import { createHmac, timingSafeEqual } from "crypto";
import { optEnv } from "./config";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Webhooks must send the shared secret as header `x-ehub-secret` or `?secret=`. */
export function isAuthorizedWebhook(req: Request): boolean {
  const secret = optEnv("WEBHOOK_SECRET");
  if (!secret) return false;
  const given = req.headers.get("x-ehub-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  return safeEqual(given, secret);
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function isAuthorizedCron(req: Request): boolean {
  const secret = optEnv("CRON_SECRET");
  if (!secret) return false;
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

function signingKey() {
  return optEnv("APPROVAL_SECRET") ?? optEnv("WEBHOOK_SECRET") ?? "";
}

/** Signed token for one-click approval links (no login needed, can't be forged). */
export function signToken(value: string): string {
  return createHmac("sha256", signingKey()).update(value).digest("hex").slice(0, 32);
}

export function verifyToken(value: string, token: string): boolean {
  if (!signingKey()) return false;
  return safeEqual(signToken(value), token);
}
