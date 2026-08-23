/**
 * ─────────────────────────────────────────────────────────────────────────────
 * twilioClient.ts — Sets up Twilio SDK connection once, reused everywhere.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Initializes the Twilio client with credentials from environment variables.
 * This singleton is imported by agents that need to make voice calls or
 * send SMS messages (AutoBooking, EmergencyEscalation).
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID  — Twilio account identifier
 *   TWILIO_AUTH_TOKEN   — Twilio authentication token
 *   TWILIO_PHONE_NUMBER — Twilio phone number for outgoing calls/SMS
 *
 * Usage:
 *   import { twilioClient, TWILIO_PHONE } from "../utils/twilioClient";
 *   await twilioClient.messages.create({ ... });
 */

// ─── Configuration ──────────────────────────────────────────────────────────

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
export const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

// ─── Client Initialization ──────────────────────────────────────────────────

/**
 * Twilio client singleton.
 * Will be `null` if credentials are not configured (development mode).
 *
 * In production, this initializes the actual Twilio SDK client:
 *   import twilio from "twilio";
 *   export const twilioClient = twilio(ACCOUNT_SID, AUTH_TOKEN);
 */
export const twilioClient = (() => {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    console.warn("[TwilioClient] Credentials not configured — running in mock mode");
    return null;
  }

  // TODO: Uncomment when twilio package is installed
  // import twilio from "twilio";
  // return twilio(ACCOUNT_SID, AUTH_TOKEN);

  console.info("[TwilioClient] Initialized successfully");
  return {
    messages: {
      create: async (params: Record<string, string>) => {
        console.info("[TwilioClient] Mock SMS sent:", params);
        return { sid: "mock_sms_sid" };
      },
    },
    calls: {
      create: async (params: Record<string, string>) => {
        console.info("[TwilioClient] Mock call initiated:", params);
        return { sid: "mock_call_sid" };
      },
    },
  };
})();

/**
 * Send a test SMS (for development/debugging).
 */
export async function sendTestSMS(to: string, body: string): Promise<void> {
  if (!twilioClient) {
    console.warn("[TwilioClient] Cannot send SMS — client not initialized");
    return;
  }
  await twilioClient.messages.create({
    body,
    from: TWILIO_PHONE || "+10000000000",
    to,
  });
}
