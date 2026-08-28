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
 * @returns Mock triage result with department routing
 */
export async function executeTriage(
  text: string,
  _requestId: string
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

  return {
    department: matchedDept,
    urgency,
    suggested_specialist: matchedSpecialist,
    action: urgency === "HIGH"
      ? `Urgent referral to ${matchedDept} — seek immediate medical attention`
      : `Schedule appointment with ${matchedSpecialist ?? "General Practitioner"}`,
    keywords_detected: keywordsDetected,
    // Placeholder confidence for the prototype — replace with a real
    // confidence score once an actual NLP/classification model is integrated.
    confidence: keywordsDetected.length > 0 ? 0.82 : 0.65,
  };
}
