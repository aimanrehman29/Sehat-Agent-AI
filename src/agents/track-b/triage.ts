/**
 * ─────────────────────────────────────────────────────────────────────────────
 * triage.ts — Symptom → department routing logic (Track B).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Analyzes patient symptom descriptions (text or voice-transcribed) and
 * routes them to the appropriate medical department or specialist.
 *
 * Input:  "I have chest pain and shortness of breath"
 * Output: { department: "Cardiology", urgency: "HIGH", action: "Refer to ER" }
 *
 * Mock implementation — returns realistic sample data for UI testing.
 * Replace with real NLP-based classification in production.
 */

import type { TriageResult } from "@/types/orchestrator";

/**
 * Symptom-to-department mapping rules (mock).
 * In production, this would use an NLP model or a medical knowledge graph.
 *
 * Each entry maps a canonical symptom key to its department routing and
 * a set of token groups covering English, Urdu/Roman Urdu, and Hinglish
 * descriptions that real users may type or speak.
 *
 * Matching is TOKEN-BASED: a symptom is detected when ALL tokens in any
 * single group appear in the input text (in any order, with any words in
 * between). This avoids the fragility of exact substring matching where
 * inserted words like "shadeed" or "mein" break detection.
 */
const SYMPTOM_RULES: Record<
  string,
  { department: string; specialist: string | null; tokens: string[][] }
> = {
  "chest pain": {
    department: "Cardiology",
    specialist: "Cardiologist",
    tokens: [
      ["chest", "pain"],
      ["seenay", "dard"],
      ["dil", "dard"],
    ],
  },
  "shortness of breath": {
    department: "Pulmonology",
    specialist: "Pulmonologist",
    tokens: [
      ["shortness", "breath"],
      ["saans", "nahi"],
      ["saans", "phoolna"],
    ],
  },
  "headache": {
    department: "Neurology",
    specialist: "Neurologist",
    tokens: [
      ["headache"],
      ["sar", "dard"],
    ],
  },
  "stomach pain": {
    department: "Gastroenterology",
    specialist: "Gastroenterologist",
    tokens: [
      ["stomach", "pain"],
      ["pait", "dard"],
      ["pet", "dard"],
    ],
  },
  "fever": {
    department: "General Medicine",
    specialist: null,
    tokens: [
      ["fever"],
      ["bukhar"],
    ],
  },
  "skin rash": {
    department: "Dermatology",
    specialist: "Dermatologist",
    tokens: [
      ["skin", "rash"],
      ["kharish"],
      ["daane"],
    ],
  },
  "joint pain": {
    department: "Orthopedics",
    specialist: "Orthopedic Surgeon",
    tokens: [
      ["joint", "pain"],
      ["jodon", "dard"],
    ],
  },
  "dizziness": {
    department: "Neurology",
    specialist: "Neurologist",
    tokens: [
      ["dizziness"],
      ["chakkar", "aana"],
      ["sar", "ghoomna"],
    ],
  },
  "cough": {
    department: "Pulmonology",
    specialist: "Pulmonologist",
    tokens: [
      ["cough"],
      ["khansi"],
    ],
  },
  "sore throat": {
    department: "ENT",
    specialist: "ENT Specialist",
    tokens: [
      ["sore", "throat"],
      ["gala", "kharab"],
    ],
  },
};

/**
 * Token-based matching helper: returns true if ALL tokens in any single
 * group are present in the word-set. Handles extra words between key terms.
 */
function matchesTokenGroups(words: Set<string>, groups: string[][]): boolean {
  return groups.some((group) => group.every((token) => words.has(token)));
}

/** Canonical symptom keys whose detection should flag HIGH urgency */
const HIGH_URGENCY_SYMPTOMS = new Set([
  "chest pain",
  "shortness of breath",
]);

// ─── Location Preference Detection ──────────────────────────────────────────

/** Keywords suggesting the patient needs the nearest/urgent facility */
const NEAREST_KEYWORDS = new Set([
  "nearest", "closest", "qareeb", "nazdeek", "emergency",
  "turant", "abhi", "urgent", "immediate", "jaldi",
]);

/** Keywords suggesting the patient wants the best-rated facility */
const BEST_KEYWORDS = new Set([
  "best", "achaa", "acha", "top", "reputed",
  "trusted", "acha Doctor", "behtareen",
]);

/**
 * Detect the patient's location-search preference from their symptom text.
 *
 * - Words like "nearest", "qareeb", "emergency" suggest urgency → "nearest"
 * - Words like "best", "achaa", "top" suggest quality preference → "best"
 * - Both present, or neither → "balanced"
 *
 * NOTE: The caller (route handler) MUST override this to "nearest" when the
 * emergency check flags a genuine emergency — safety overrides stated preference.
 *
 * @param text - Patient's symptom/routing description
 * @returns The detected ranking strategy preference
 */
export function detectLocationPreference(text: string): "nearest" | "best" | "balanced" {
  const words = text.toLowerCase().split(/\s+/);
  const wordSet = new Set(words);

  const hasNearest = words.some((w) => NEAREST_KEYWORDS.has(w));
  const hasBest = words.some((w) => BEST_KEYWORDS.has(w));

  // Multi-word phrase detection for "sabse acha" (Urdu: "the best")
  const hasMultiWordBest = text.toLowerCase().includes("sabse acha");

  const wantsNearest = hasNearest;
  const wantsBest = hasBest || hasMultiWordBest;

  if (wantsNearest && !wantsBest) return "nearest";
  if (wantsBest && !wantsNearest) return "best";
  // Both present or neither present → balanced
  return "balanced";
}

/**
 * Execute triage analysis on the given symptom text.
 *
 * NOTE: This function only handles department routing. Emergency detection
 * (both physical and mental health) is the responsibility of the route
 * handler, which calls `executeEmergencyCheck` unconditionally and gates
 * triage behind it.
 *
 * @param text - Patient's symptom description
 * @param _requestId - Request identifier for tracing (unused in mock)
 * @param isEmergency - When true, forces suggested_location_preference to
 *   "nearest" regardless of keyword detection (safety override, passed by
 *   the route handler after emergency check)
 * @returns Triage result with department routing and location preference
 */
export async function executeTriage(
  text: string,
  _requestId: string,
  isEmergency = false
): Promise<TriageResult> {
  const lower = text.toLowerCase();
  const words = new Set(lower.split(/\s+/));
  const keywordsDetected: string[] = [];
  let matchedDept = "General Medicine";
  let matchedSpecialist: string | null = null;
  let isHighUrgency = false;

  for (const [canonicalSymptom, rule] of Object.entries(SYMPTOM_RULES)) {
    if (matchesTokenGroups(words, rule.tokens)) {
      keywordsDetected.push(canonicalSymptom);
      matchedDept = rule.department;
      matchedSpecialist = rule.specialist;
      if (HIGH_URGENCY_SYMPTOMS.has(canonicalSymptom)) {
        isHighUrgency = true;
      }
    }
  }

  const urgency = isHighUrgency ? "HIGH" as const : "MODERATE" as const;

  // ── Detect location preference from symptom text ──
  // Safety override: if the emergency check flagged this as a genuine emergency,
  // always force "nearest" regardless of what keyword detection says.
  const detectedPreference = detectLocationPreference(text);
  const suggested_location_preference = isEmergency ? "nearest" as const : detectedPreference;

  return {
    department: matchedDept,
    urgency,
    suggested_specialist: matchedSpecialist,
    action: urgency === "HIGH"
      ? `Urgent referral to ${matchedDept} — seek immediate medical attention`
      : `Schedule appointment with ${matchedSpecialist ?? "General Practitioner"}`,
    keywords_detected: keywordsDetected,
    suggested_location_preference,
    // Placeholder confidence for the prototype — replace with a real
    // confidence score once an actual NLP/classification model is integrated.
    confidence: keywordsDetected.length > 0 ? 0.82 : 0.65,
  };
}
