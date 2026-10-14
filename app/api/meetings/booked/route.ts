/** 02 Meeting Booking (+ proposal-call bookings for 06). Point Cal.com / Calendly webhooks here. */
import { webhook, readBody, ok, bad, background } from "@/lib/route";
import { normalizeBooking, handleBooking } from "@/lib/workflows/02-meeting-booking";

export const maxDuration = 120;

export const POST = webhook(async (req) => {
  const booking = normalizeBooking(await readBody(req));
  if (!booking || !booking.email || !booking.startMs) return bad("Unrecognised booking payload");
  background("booking", () => handleBooking(booking));
  return ok({ ok: true, type: booking.type, action: booking.action }, 202);
});
