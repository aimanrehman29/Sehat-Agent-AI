/**
 * POST /api/track-b/book/confirm
 *
 * Twilio confirmation webhook for the Auto-Booking agent (Track B).
 *
 * After the AI plays its appointment request and the <Gather> captures the
 * receptionist's spoken response, Twilio POSTs to this route with the
 * transcribed speech in the `SpeechResult` form field.
 *
 * This route:
 *   1. Extracts the `CallSid` and `SpeechResult` from the Twilio POST data
 *   2. Calls `updateBookingStatus()` to analyse the transcript and update
 *      the booking status (CALL_INITIATED → CONFIRMED if affirmative)
 *   3. Returns TwiML with a closing <Say> thanking the receptionist
 *
 * NOTE: The response is valid TwiML XML (text/xml), not JSON — Twilio
 * requires this content-type for webhook responses.
 */

import { NextResponse } from "next/server";
import {
  updateBookingStatus,
  getActiveCallStore,
} from "@/agents/track-b/autoBooking";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ─── Form Data Parser ───────────────────────────────────────────────────────

/**
 * Parse `application/x-www-form-urlencoded` body from Twilio's POST.
 * Twilio sends form data (not JSON) for TwiML webhook callbacks.
 */
async function parseTwilioFormBody(
  request: Request
): Promise<Record<string, string>> {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

// ─── TwiML Builder ──────────────────────────────────────────────────────────

/**
 * Escape special XML characters for safe inclusion in TwiML.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build a closing TwiML <Response> that thanks the receptionist.
 * The message varies based on whether the appointment was confirmed.
 */
function buildClosingTwiml(confirmed: boolean): string {
  if (confirmed) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy" language="en-IN">
    Bohat shukriya. Appointment confirm ho gayi hai.
    Sehat-Assist AI aap ka shukarguzaar hai. Khuda hafiz.
  </Say>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy" language="en-IN">
    ${escapeXml("Aap ka jawab record kar liya gaya hai. Hum jald rabta karein gay. Shukriya.")}
  </Say>
</Response>`;
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const formData = await parseTwilioFormBody(request);

  const callSid = formData.CallSid ?? "";
  const speechResult = formData.SpeechResult ?? "";

  // ── Update booking status based on the receptionist's speech ──
  let confirmed = false;

  if (callSid && speechResult) {
    const updatedResult = updateBookingStatus(callSid, speechResult);
    if (updatedResult) {
      confirmed = updatedResult.status === "CONFIRMED";
    }
  } else if (callSid) {
    // ── No speech detected by Twilio — log empty transcript in the store ──
    const store = getActiveCallStore();
    const stored = store.get(callSid);
    if (stored) {
      stored.rawReceptionistResponse = "[no speech detected]";
      store.set(callSid, stored);
    }
  }

  const twiml = buildClosingTwiml(confirmed);

  // TwiML MUST be returned as text/xml content-type — Twilio rejects JSON.
  return new NextResponse(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}
