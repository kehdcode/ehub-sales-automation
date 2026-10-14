const DAY = 24 * 60 * 60 * 1000;

/** UTC offset of a time zone at a given instant, in minutes (e.g. Africa/Lagos → +60). */
export function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = part.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -mins : mins;
}

/** Start and end (ms, UTC) of "today" in the given time zone. */
export function todayBounds(tz: string, now: Date = new Date()): { start: number; end: number } {
  const offset = tzOffsetMinutes(tz, now) * 60_000;
  const local = new Date(now.getTime() + offset);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = startLocal - offset;
  return { start, end: start + DAY - 1 };
}

export function addDays(ms: number, days: number) {
  return ms + days * DAY;
}

/** HubSpot "date" properties must be midnight UTC. */
export function hubspotDate(ms: number): string {
  const d = new Date(ms);
  return String(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function formatWhen(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(ms));
}

export function toMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  if (/^\d+$/.test(value)) return Number(value);
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}
