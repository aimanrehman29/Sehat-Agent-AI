/**
 * POST /api/track-b/book/twiml
 *
 * TwiML webhook route for the Auto-Booking agent (Track B).
 *
 * Twilio fetches this endpoint (via POST) when the outbound call connects.
 * The response is valid TwiML XML (not JSON) containing <Say> instructions
 * that play a scripted AI self-disclosure and appointment request message
 * to the call recipient.
 *
 * Query parameters (set by autoBooking.ts when constructing the webhook URL):
 *   - patientName: patient's full name
 *   - department: target medical department
 *   - hospitalName: hospital or clinic name
 *   - requestedTime: human-readable date and time string
 *
 * NOTE: This is a single-turn exchange — the AI speaks the appointment
 * request and then uses <Gather input="speech"> to capture the
 * receptionist's spoken response. Full dynamic NLU conversation is out
 * of scope for this hackathon prototype.
 */

import { NextResponse } from "next/server";
import { buildBookingScript } from "@/agents/track-b/bookingScript";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ─── TwiML XML Helpers ──────────────────────────────────────────────────────

/**
 * Escape special XML characters so user-supplied values don't break the
 * TwiML document structure.
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
 * Build a complete TwiML <Response> document with <Say> verbs and a
 * <Gather> block to capture the receptionist's spoken response.
 * Uses voice="Polly.Amy" (female English TTS) — Twilio's built-in TTS.
 * The language is set to "en-IN" for South Asian English pronunciation,
 * which produces more natural Urdu/Roman Urdu phrasing than "en-US".
 *
 * The <Gather> action URL points to /api/track-b/book/confirm which
 * Twilio will POST to with the SpeechResult field.
 *
 * Script text is imported from the shared bookingScript module to stay
 * identical to the simulated-call browser component.
 */
function buildTwimlResponse(
  patientName: string,
  department: string,
  hospitalName: string,
  requestedTime: string
): string {
  const script = buildBookingScript(patientName, department, hospitalName, requestedTime);
  const safeOpening = escapeXml(script.opening);
  const safeRequest = escapeXml(script.request);
  const safePrompt = escapeXml(script.prompt);
  const safeAsk = escapeXml("Kya aap yeh appointment confirm kar saktay hain?");
  const safeNoResponse = escapeXml(script.closingNoResponse);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy" language="en-IN">${safeOpening}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Amy" language="en-IN">${safeRequest}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Amy" language="en-IN">${safePrompt}</Say>
  <Gather input="speech" speechTimeout="auto" action="/api/track-b/book/confirm" method="POST" language="en-IN">
    <Say voice="Polly.Amy" language="en-IN">${safeAsk}</Say>
  </Gather>
  <!-- If Gather times out without speech, fall through to this closing message -->
  <Say voice="Polly.Amy" language="en-IN">${safeNoResponse}</Say>
</Response>`;
}

// ─── Route Handlers ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);

  const patientName = searchParams.get("patientName") ?? "Patient";
  const department = searchParams.get("department") ?? "General Medicine";
  const hospitalName = searchParams.get("hospitalName") ?? "the hospital";
  const requestedTime = searchParams.get("requestedTime") ?? "the requested time";

  const twiml = buildTwimlResponse(patientName, department, hospitalName, requestedTime);

  // TwiML MUST be returned as text/xml content-type — Twilio rejects JSON.
  return new NextResponse(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

/**
 * GET handler — allows quick browser testing of the TwiML output during
 * development. Twilio itself always uses POST for webhook fetches.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const patientName = searchParams.get("patientName") ?? "Patient";
  const department = searchParams.get("department") ?? "General Medicine";
  const hospitalName = searchParams.get("hospitalName") ?? "the hospital";
  const requestedTime = searchParams.get("requestedTime") ?? "the requested time";

  const twiml = buildTwimlResponse(patientName, department, hospitalName, requestedTime);

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}
