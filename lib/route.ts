import { after } from "next/server";
import { isAuthorizedCron, isAuthorizedWebhook, unauthorized } from "./auth";

export const ok = (data: unknown, status = 200) => Response.json(data, { status });
export const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** Parse JSON or form bodies. */
export async function readBody(req: Request): Promise<any> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    return Object.fromEntries((await req.formData()).entries());
  }
  const text = await req.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

/** Wrap a webhook: check secret, run handler, turn exceptions into JSON errors. */
export function webhook(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (!isAuthorizedWebhook(req)) return unauthorized();
    try { return await handler(req); }
    catch (e) { console.error(e); return bad((e as Error).message, 500); }
  };
}

export function cron(handler: () => Promise<unknown>) {
  return async (req: Request) => {
    if (!isAuthorizedCron(req)) return unauthorized();
    try { return ok({ ok: true, ranAt: new Date().toISOString(), results: await handler() }); }
    catch (e) { console.error(e); return bad((e as Error).message, 500); }
  };
}

/** Respond immediately, keep working in the background (webhook senders expect a fast 200). */
export function background(label: string, task: () => Promise<unknown>) {
  after(async () => {
    try { await task(); }
    catch (e) { console.error(`[background:${label}]`, e); }
  });
}
