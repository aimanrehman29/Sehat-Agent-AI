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
 * a list of keyword variants covering English, Urdu/Roman Urdu, and
 * Hinglish descriptions that real users may type or speak.
 */
const SYMPTOM_RULES: Record<
  string,
  { department: string; specialist: string | null; keywords: string[] }
> = {
  "chest pain": {
    department: "Cardiology",
    specialist: "Cardiologist",
    keywords: ["chest pain", "seenay mein dard", "dil mein dard"],
  },
  "shortness of breath": {
    department: "Pulmonology",
    specialist: "Pulmonologist",
    keywords: ["shortness of breath", "saans nahi aa rahi", "saans phoolna"],
  },
  "headache": {
    department: "Neurology",
    specialist: "Neurologist",
    keywords: ["headache", "sar dard"],
  },
  "stomach pain": {
    department: "Gastroenterology",
    specialist: "Gastroenterologist",
    keywords: ["stomach pain", "pait dard", "pet mein dard"],
  },
  "fever": {
    department: "General Medicine",
    specialist: null,
    keywords: ["fever", "bukhar"],
  },
  "skin rash": {
    department: "Dermatology",
    specialist: "Dermatologist",
    keywords: ["skin rash", "kharish", "daane"],
  },
  "joint pain": {
    department: "Orthopedics",
    specialist: "Orthopedic Surgeon",
    keywords: ["joint pain", "jodon ka dard"],
  },
  "dizziness": {
    department: "Neurology",
    specialist: "Neurologist",
    keywords: ["dizziness", "chakkar aana", "sar ghoomna"],
  },
  "cough": {
    department: "Pulmonology",
    specialist: "Pulmonologist",
    keywords: ["cough", "khansi"],
  },
  "sore throat": {
    department: "ENT",
    specialist: "ENT Specialist",
    keywords: ["sore throat", "gala kharab"],
  },
};

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
  const keywordsDetected: string[] = [];
  let matchedDept = "General Medicine";
  let matchedSpecialist: string | null = null;
  let isHighUrgency = false;

  for (const [canonicalSymptom, rule] of Object.entries(SYMPTOM_RULES)) {
    for (const variant of rule.keywords) {
      if (lower.includes(variant)) {
        keywordsDetected.push(variant);
        matchedDept = rule.department;
        matchedSpecialist = rule.specialist;
        if (HIGH_URGENCY_SYMPTOMS.has(canonicalSymptom)) {
          isHighUrgency = true;
        }
        break; // one match per canonical symptom is sufficient
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
