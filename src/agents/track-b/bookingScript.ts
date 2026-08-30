/**
 * ─────────────────────────────────────────────────────────────────────────────
 * bookingScript.ts — Shared booking conversation script (Track B).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Contains the AI conversation script and confirmation-detection logic for the
 * Auto-Booking agent. This module is intentionally free of any server-side
 * dependencies (no Twilio SDK, no process.env) so it can be imported by both
 * the Twilio TwiML routes (server-side) and the simulated-call browser
 * component (client-side, "use client").
 *
 * The script text defined here is the SINGLE source of truth for what the AI
 * "says" during the booking call — whether that call is a real Twilio voice
 * call or a browser-based Web Speech API simulation. This guarantees wording
 * stays identical across both paths and eliminates duplication.
 */

// ─── Script Builder ─────────────────────────────────────────────────────────

/** Shape returned by buildBookingScript() */
export interface BookingScript {
  /** AI self-disclosure greeting (Urdu/Roman Urdu) */
  opening: string;
  /** Appointment request with patient details */
  request: string;
  /** Prompt asking the receptionist to confirm */
  prompt: string;
  /** Closing line spoken when the appointment is confirmed */
  closingConfirmed: string;
  /** Closing line spoken when no response is received (Twilio timeout) */
  closingNoResponse: string;
  /** Closing line spoken when the response is unclear / not confirmed */
  closingNoConfirmation: string;
}

/**
 * Build the full AI conversation script for a booking call.
 *
 * Used by:
 *   - TwiML route (`/api/track-b/book/twiml`) to populate <Say> verbs
 *   - Simulated-call browser component (`/simulated-call`) for speechSynthesis
 *
 * @param patientName - Patient's full name
 * @param department - Target medical department
 * @param hospitalName - Hospital or clinic name
 * @param requestedTime - Human-readable date and time string
 * @returns Script object with opening, request, prompt, and closing lines
 */
export function buildBookingScript(
  patientName: string,
  department: string,
  hospitalName: string,
  requestedTime: string
): BookingScript {
  return {
    opening:
      `Assalam-o-Alaikum. Main Sehat-Assist AI hoon, ek AI health navigation assistant. ` +
      `Main ${patientName} ki taraf se appointment ke liye baat kar raha hoon.`,
    request:
      `${patientName} ko ${department} department mein appointment chahiye, ` +
      `${hospitalName} mein, ${requestedTime} par.`,
    prompt: "Barah-e-karam confirm karein ya koi waqt bataen.",
    closingConfirmed:
      "Bohat shukriya. Appointment confirm ho gayi hai. " +
      "Sehat-Assist AI aap ka shukarguzaar hai. Khuda hafiz.",
    closingNoResponse:
      "Koi jawab nahi mila. Hum dobara call karein gay. Shukriya.",
    closingNoConfirmation:
      "Aap ka jawab record kar liya gaya hai. Hum jald rabta karein gay. Shukriya.",
  };
}

// ─── Confirmation Detection ─────────────────────────────────────────────────

/**
 * Token sets that indicate the receptionist confirmed the appointment.
 * Covers Urdu/Roman Urdu and English affirmative phrases.
 * Matching is case-insensitive; any single token match is sufficient.
 */
const CONFIRMATION_KEYWORDS = new Set([
  "haan", "han", "yes", "theek", "thek", "okay", "ok",
  "confirm", "confirmed", "done", "ho", "ji", "bilkul",
  "pakka", "sure", "appointment", "mil", "gai",
]);

/**
 * Pattern that matches a time-like expression in the transcript.
 * Covers formats such as "10:00 AM", "3 pm", "14:30", "10 bajey", etc.
 */
const TIME_PATTERN =
  /\d{1,2}[:\s.]\d{0,2}\s*(?:am|pm|baj[ae]y|baje)?/i;

/**
 * Analyse a speech transcript to determine whether the receptionist confirmed
 * the appointment. Uses simple keyword + time-pattern matching.
 *
 * Used by:
 *   - Twilio /confirm route to update booking status
 *   - Simulated-call browser component to evaluate SpeechRecognition output
 *
 * @param transcript - Speech-to-text transcription
 * @returns true if a confirmation keyword or time expression is detected
 */
export function isConfirmationDetected(transcript: string): boolean {
  const lower = transcript.toLowerCase();
  const words = lower.split(/\s+/);

  // ── Check for any confirmation keyword ──
  if (words.some((word) => CONFIRMATION_KEYWORDS.has(word))) {
    return true;
  }

  // ── Check if the receptionist stated a time (suggests they're booking) ──
  if (TIME_PATTERN.test(transcript)) {
    return true;
  }

  return false;
}

// ─── Shared Constants ───────────────────────────────────────────────────────

/**
 * E-Parchi closing message shown when the appointment is confirmed.
 * Matches the blueprint's sample E-Parchi "Show this pass at counter" style.
 */
export const CONFIRMED_EPARCHI_MESSAGE =
  "Appointment confirmed — please show this E-Parchi at the hospital " +
  "reception counter on the day of your visit.";

/**
 * Prototype safety note — always attached to every E-Parchi generated
 * via Twilio. In this prototype phase, the call is placed ONLY to the
 * developer's test number, never to a real hospital phone line.
 */
export const PROTOTYPE_NOTE =
  "PROTOTYPE: This call was routed to the developer's test number " +
  "(TWILIO_TEST_NUMBER), not the hospital's actual phone line. " +
  "In production, the call would be placed to the hospital's appointment desk.";

/**
 * Note attached to E-Parchis generated via the browser-based simulated call.
 * Clearly distinguishes from real Twilio calls.
 */
export const SIMULATED_NOTE =
  "SIMULATED: This appointment was requested via a browser-based simulated " +
  "call using the Web Speech API. No actual phone call was placed. " +
  "This is a prototype demonstration — in production, a real call would be made.";
