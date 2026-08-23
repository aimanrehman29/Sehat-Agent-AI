/**
 * ─────────────────────────────────────────────────────────────────────────────
 * disclaimers.ts — Shared "assist not diagnose" disclaimer text.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The canonical disclaimer that MUST be included in EVERY response from
 * any Sehat-Agent AI module. This is enforced architecturally — the
 * orchestrator always injects this text into the response envelope.
 *
 * IMPORTANT:
 *   - Do NOT modify this text without team consensus.
 *   - Do NOT create alternative disclaimers.
 *   - Every agent response, regardless of channel, must carry this exact text.
 */

/**
 * The mandatory disclaimer — appended to every AI-generated response.
 */
export const DISCLAIMER = Object.freeze(
  "⚕️ ASSIST — NOT DIAGNOSE: This AI-generated analysis is for informational " +
    "and educational purposes only. It is NOT a substitute for professional " +
    "medical advice, diagnosis, or treatment. Always consult a qualified " +
    "healthcare provider before making any medical decisions. Sehat-Agent AI " +
    "does not guarantee the accuracy, completeness, or reliability of the " +
    "information provided. In case of a medical emergency, call your local " +
    "emergency services immediately."
);

/**
 * Short-form disclaimer for SMS / push notifications where space is limited.
 */
export const DISCLAIMER_SHORT = Object.freeze(
  "⚕️ AI assist only — not a medical diagnosis. Consult a doctor."
);

/**
 * Voice-spoken disclaimer for Twilio call interactions.
 */
export const DISCLAIMER_VOICE = Object.freeze(
  "Please note: this is an AI-assisted analysis for informational purposes only. " +
    "It is not a medical diagnosis. Please consult a qualified healthcare provider " +
    "before making any medical decisions."
);
