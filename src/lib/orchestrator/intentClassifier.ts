/**
 * ─────────────────────────────────────────────────────────────────────────────
 * intentClassifier.ts — Keyword-based intent router for the Orchestrator.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Fast, transparent, keyword-based classifier. No ML model — intentional
 * scope for a hackathon prototype.
 *
 * IMPORTANT: Must run AFTER the emergency check, never before.
 * A message like "I can't breathe, what hospital is near me" should
 * short-circuit to emergency handling, not get intent-classified first.
 *
 * LIMITATION: Will misclassify ambiguous input — expected and acceptable.
 * Do not add an LLM call here; that belongs in the fallback assistant.
 */

// ─── Intent Types ───────────────────────────────────────────────────────────

export type Intent =
  | "emergency"
  | "symptom_triage"
  | "hospital_search"
  | "doctor_lookup"
  | "drug_verification"
  | "lab_report"
  | "prescription"
  | "unknown";

// ─── Keyword Map ────────────────────────────────────────────────────────────

/**
 * Keywords for each non-emergency intent. Covers English, Urdu/Roman Urdu,
 * and Hinglish variants that Pakistani users commonly type or speak.
 */
const INTENT_KEYWORDS: Record<
  Exclude<Intent, "emergency" | "unknown">,
  string[]
> = {
  symptom_triage: [
    "pain", "fever", "sick", "hurts", "symptom",
    "dard", "bukhar", "takleef",
  ],
  doctor_lookup: [
    "doctor", "specialist", "cardiologist", "consultant",
    "appointment with dr",
  ],
  hospital_search: [
    "hospital", "nearest", "near me", "clinic", "location",
    "aspatal", "qareeb",
  ],
  drug_verification: [
    "medicine", "drug", "tablet", "authentic", "fake medicine",
    "dawai",
  ],
  lab_report: [
    "lab report", "test result", "blood test", "cbc", "lft",
  ],
  prescription: [
    "prescription", "nuskha", "doctor wrote", "medicines prescribed",
  ],
};

// ─── Classifier ─────────────────────────────────────────────────────────────

/**
 * Classify the user's intent based on keyword presence.
 *
 * @param text - The user's message
 * @returns The detected Intent, or "unknown" if no keywords match
 */
export function classifyIntent(text: string): Intent {
  const lower = text.toLowerCase();

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return intent as Intent;
    }
  }

  return "unknown";
}
