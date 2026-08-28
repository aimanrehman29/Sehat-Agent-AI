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
 * NOTE: This is a scripted announcement only — real-time dynamic AI
 * conversation with the receptionist (live speech recognition mid-call)
 * is out of scope for this hackathon prototype.
 */

import { NextResponse } from "next/server";

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
 * Build a complete TwiML <Response> document with one or more <Say> verbs.
 * Uses voice="Polly.Amy" (female English TTS) — Twilio's built-in TTS.
 * The language is set to "en-IN" for South Asian English pronunciation,
 * which produces more natural Urdu/Roman Urdu phrasing than "en-US".
 */
function buildTwimlResponse(
  patientName: string,
  department: string,
  hospitalName: string,
  requestedTime: string
): string {
  const safeName = escapeXml(patientName);
  const safeDept = escapeXml(department);
  const safeHospital = escapeXml(hospitalName);
  const safeTime = escapeXml(requestedTime);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy" language="en-IN">
    Assalam-o-Alaikum. Main Sehat-Assist AI hoon, ek AI health navigation assistant.
    Main ${safeName} ki taraf se appointment ke liye baat kar raha hoon.
  </Say>
  <Pause length="1"/>
  <Say voice="Polly.Amy" language="en-IN">
    ${safeName} ko ${safeDept} department mein appointment chahiye,
    ${safeHospital} mein, ${safeTime} par.
  </Say>
  <Pause length="1"/>
  <Say voice="Polly.Amy" language="en-IN">
    Yeh call Sehat-Assist AI prototype ki taraf se hai.
    Barah-e-karam appointment ki confirmation ke liye wapas call karein.
    Shukriya.
  </Say>
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
