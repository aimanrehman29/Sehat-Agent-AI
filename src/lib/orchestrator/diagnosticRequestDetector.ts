/**
 * ─────────────────────────────────────────────────────────────────────────────
 * diagnosticRequestDetector.ts — "Assist, not diagnose" boundary gate.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Detects when someone is explicitly asking for a diagnosis (not just
 * describing a symptom) and responds with the assist-not-diagnose boundary
 * immediately. Runs AFTER emergency detection, BEFORE normal intent
 * classification.
 *
 * Kept deterministic (keyword-based, like emergency detection) rather than
 * left to an LLM's judgment, since this is a safety-boundary statement that
 * must be reliable and testable, not just "usually right."
 *
 * Deliberately conservative: only matches strong, unambiguous diagnostic-seeking
 * phrasing ("diagnose", "diagnosis", "what disease do I have") — NOT broad
 * patterns like "do I have ___", which would incorrectly catch normal symptom
 * descriptions ("do I have a fever" is a legitimate Triage query, not a
 * diagnosis request). Better to occasionally miss a diagnostic request than
 * to break ordinary symptom routing.
 */

/**
 * Token groups — every token in a group must appear in the message for the
 * group to match. Single-word groups catch explicit diagnostic language;
 * multi-word groups catch common diagnostic-question phrasings.
 */
const DIAGNOSTIC_TOKEN_GROUPS: string[][] = [
  ["diagnose"],
  ["diagnosis"],
  ["diagnostic"],
  ["what", "disease", "have"],
  ["what", "condition", "have"],
  ["am", "sick", "with"],
  ["confirm", "have"],
  ["tell", "whats", "wrong"],
];

/**
 * Check whether a message is an explicit request for a diagnosis.
 *
 * @param text - The user's message (any casing; apostrophes are stripped so
 *               "what's" matches the "whats" token)
 * @returns true when the message matches a diagnostic-request token group
 */
export function isDiagnosticRequest(text: string): boolean {
  const words = new Set(text.toLowerCase().replace(/[’']/g, "").split(/\s+/));
  return DIAGNOSTIC_TOKEN_GROUPS.some((group) => group.every((token) => words.has(token)));
}

/** Boundary message returned when a diagnostic request is detected. */
export const DIAGNOSTIC_BOUNDARY_MESSAGE =
  "Sehat-Agent AI is built to assist, not diagnose. I can't tell you what condition you have. " +
  "What I can do: match your symptoms to the right hospital department, help you find nearby " +
  "care, or explain a lab report in plain language. For an actual diagnosis, please see a " +
  "qualified doctor.";
