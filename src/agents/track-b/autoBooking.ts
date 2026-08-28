/**
 * ─────────────────────────────────────────────────────────────────────────────
 * autoBooking.ts — AI-disclosed appointment booking via Twilio voice (Track B).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Places an outbound Twilio voice call to request a hospital appointment on
 * behalf of the patient. The call plays a scripted AI self-disclosure message
 * in Urdu/Roman Urdu via Twilio's <Say> verb (built-in TTS), followed by the
 * appointment request details. A digital E-Parchi (appointment slip) is then
 * generated with the booking status.
 *
 * Input:  { patientName, department, hospitalName, requestedTime }
 * Output: E-Parchi with status "CALL_INITIATED" and Twilio call SID
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCAL TESTING NOTE:
 * Twilio cannot reach localhost directly. To test the TwiML webhook locally:
 *   1. Run `ngrok http 3000` (free tool — https://ngrok.com)
 *   2. Copy the public HTTPS URL ngrok gives you (e.g. https://abcd1234.ngrok-free.app)
 *   3. Set PUBLIC_BASE_URL=https://abcd1234.ngrok-free.app in your .env file
 *   4. The agent uses PUBLIC_BASE_URL to construct the TwiML webhook URL that
 *      Twilio fetches when the call connects.
 * Without PUBLIC_BASE_URL, the agent will throw a clear error before placing the call.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BookingResult } from "@/types/orchestrator";

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Prototype safety note — always attached to every E-Parchi generated.
 * In this prototype phase, the Twilio call is placed ONLY to the developer's
 * test number, never to a real hospital phone line.
 */
const PROTOTYPE_NOTE =
  "PROTOTYPE: This call was routed to the developer's test number " +
  "(TWILIO_TEST_NUMBER), not the hospital's actual phone line. " +
  "In production, the call would be placed to the hospital's appointment desk.";

// ─── Twilio Client ──────────────────────────────────────────────────────────

/**
 * Lazily initialise the Twilio client so that missing credentials surface
 * as a clear error at call time, not at module-load time.
 *
 * @throws Error if any required Twilio environment variable is missing
 */
function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid) {
    throw new Error(
      "[AutoBooking] TWILIO_ACCOUNT_SID environment variable is not set. " +
        "Add it to your .env file. You can find it on the Twilio Console dashboard."
    );
  }

  if (!authToken) {
    throw new Error(
      "[AutoBooking] TWILIO_AUTH_TOKEN environment variable is not set. " +
        "Add it to your .env file. You can find it on the Twilio Console dashboard."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const twilio = require("twilio");
  return twilio(accountSid, authToken);
}

/**
 * Return the Twilio source phone number (the number the call appears to come from).
 *
 * @throws Error if TWILIO_PHONE_NUMBER is not set
 */
function getTwilioPhoneNumber(): string {
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!phoneNumber) {
    throw new Error(
      "[AutoBooking] TWILIO_PHONE_NUMBER environment variable is not set. " +
        "Add it to your .env file. This is the Twilio-provided phone number " +
        "that the outbound call will appear to originate from."
    );
  }

  return phoneNumber;
}

/**
 * Return the hard-coded test destination number.
 *
 * CRITICAL SAFETY: In this prototype phase, the call destination is ALWAYS
 * the developer's TWILIO_TEST_NUMBER — regardless of any caller-supplied
 * phone number. This prevents accidental calls to real hospital lines.
 *
 * @throws Error if TWILIO_TEST_NUMBER is not set
 */
function getTestDestinationNumber(): string {
  const testNumber = process.env.TWILIO_TEST_NUMBER;

  if (!testNumber) {
    throw new Error(
      "[AutoBooking] TWILIO_TEST_NUMBER environment variable is not set. " +
        "Add it to your .env file. In this prototype phase, ALL calls are " +
        "routed exclusively to this test number for safety."
    );
  }

  return testNumber;
}

/**
 * Return the publicly reachable base URL for TwiML webhooks.
 *
 * @throws Error if PUBLIC_BASE_URL is not set
 */
function getPublicBaseUrl(): string {
  const baseUrl = process.env.PUBLIC_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      "[AutoBooking] PUBLIC_BASE_URL environment variable is not set. " +
        "Twilio needs a publicly reachable URL to fetch the TwiML instructions " +
        "when the call connects. Run `ngrok http 3000` and set the resulting " +
        "HTTPS URL as PUBLIC_BASE_URL in your .env file."
    );
  }

  // Strip trailing slash if present
  return baseUrl.replace(/\/+$/, "");
}

// ─── TwiML URL Builder ──────────────────────────────────────────────────────

/**
 * Build the absolute URL that Twilio will fetch (via POST) when the call
 * connects. This URL points to our TwiML webhook route, which returns
 * <Say> instructions for the AI self-disclosure and appointment request.
 *
 * Query parameters are encoded so the TwiML route can personalise the
 * spoken message without needing session state.
 */
function buildTwimlUrl(
  baseUrl: string,
  patientName: string,
  department: string,
  hospitalName: string,
  requestedTime: string
): string {
  const params = new URLSearchParams({
    patientName,
    department,
    hospitalName,
    requestedTime,
  });
  return `${baseUrl}/api/track-b/book/twiml?${params.toString()}`;
}

// ─── Main Booking Function ──────────────────────────────────────────────────

/**
 * Place an AI-disclosed Twilio voice call to request a hospital appointment
 * and generate a digital E-Parchi (appointment slip).
 *
 * SAFETY: The call is ALWAYS placed to TWILIO_TEST_NUMBER. Any phone number
 * passed by the caller is explicitly ignored — this is enforced in code,
 * not just by convention.
 *
 * @param patientName - Full name of the patient
 * @param department - Target medical department (e.g., "Cardiology")
 * @param hospitalName - Hospital or clinic name
 * @param requestedTime - Requested appointment date/time (ISO 8601 string)
 * @param _requestId - Request identifier for tracing (unused currently)
 * @returns E-Parchi booking result with call status and Twilio SID
 * @throws Error if Twilio credentials are missing or the API call fails
 */
export async function executeAutoBooking(
  patientName: string,
  department: string,
  hospitalName: string,
  requestedTime: string,
  _requestId: string
): Promise<BookingResult> {
  // ── Resolve environment configuration (throws on missing vars) ──
  const client = getTwilioClient();
  const fromNumber = getTwilioPhoneNumber();
  const toNumber = getTestDestinationNumber(); // SAFETY: always the test number
  const baseUrl = getPublicBaseUrl();

  // ── Parse the requested time into date + time components ──
  const requestedDate = new Date(requestedTime);
  const dateStr = requestedDate.toISOString().split("T")[0];
  const timeStr = requestedDate.toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  });

  // ── Build TwiML webhook URL ──
  const twimlUrl = buildTwimlUrl(
    baseUrl,
    patientName,
    department,
    hospitalName,
    `${dateStr} at ${timeStr}`
  );

  // ── Place the outbound call via Twilio ──
  let callSid: string | null = null;
  let callStatus: "CALL_INITIATED" | "CALL_COMPLETED" | "CALL_FAILED";

  try {
    const call = await client.calls.create({
      to: toNumber,   // SAFETY: always TWILIO_TEST_NUMBER, never a hospital number
      from: fromNumber,
      url: twimlUrl,
      method: "POST",
    });

    callSid = call.sid;
    callStatus = "CALL_INITIATED";
  } catch (twilioError: unknown) {
    const errMsg =
      twilioError instanceof Error ? twilioError.message : "Unknown Twilio error";

    throw new Error(
      `[AutoBooking] Twilio API call failed: ${errMsg}. ` +
        "Verify that TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER " +
        "are correct, and that the Twilio account has outbound calling enabled."
    );
  }

  return {
    patient_name: patientName,
    hospital_name: hospitalName,
    department,
    requested_date: dateStr,
    requested_time: timeStr,
    status: callStatus,
    call_sid: callSid,
    call_destination: toNumber,
    prototype_note: PROTOTYPE_NOTE,
    // Placeholder confidence for the prototype — replace with a real
    // confidence score once call-outcome analysis is integrated.
    confidence: 0.80,
  };
}
