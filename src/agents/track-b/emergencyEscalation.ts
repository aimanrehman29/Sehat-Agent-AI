/**
 * ─────────────────────────────────────────────────────────────────────────────
 * emergencyEscalation.ts — Emergency keyword detection (Track B).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Detects emergency keywords in patient messages or voice transcripts
 * and triggers immediate escalation protocols:
 *
 *   1. Detect keywords: "chest pain", "can't breathe", "unconscious",
 *      "bleeding", "seizure", "suicidal", "overdose", etc.
 *   2. Classify emergency severity
 *   3. Trigger immediate actions:
 *      - Notify emergency contacts
 *      - Provide first-aid instructions
 *      - Route to nearest ER (GeoLocator)
 *      - Initiate emergency call (AutoBooking)
 *
 * This agent ALWAYS takes priority over normal routing.
 * The orchestrator checks for emergencies BEFORE any other agent routing.
 *
 * Mock implementation — returns realistic sample data for UI testing.
 * Replace with real NLP-based emergency detection in production.
 */

import type { EmergencyResult } from "@/types/orchestrator";

/** Keywords that trigger emergency escalation (physical emergencies) */
const EMERGENCY_KEYWORDS = [
  "chest pain",
  "can't breathe",
  "cannot breathe",
  "unconscious",
  "severe bleeding",
  "seizure",
  "overdose",
  "stroke",
  "heart attack",
  "choking",
  "anaphylaxis",
  "cardiac arrest",
] as const;

/** Keywords indicating a mental health crisis — handled separately from physical emergencies */
const MENTAL_HEALTH_CRISIS_KEYWORDS = [
  "suicidal",
  "self-harm",
  "kill myself",
  "want to die",
] as const;

/**
 * Province → emergency service mapping.
 * Punjab, Islamabad, and KP use Rescue 1122.
 * Sindh and Balochistan use Edhi Ambulance 115.
 * Unknown or unspecified province defaults to Edhi 115 (national fallback).
 */
const PROVINCE_EMERGENCY: Record<string, { service: string; number: string }> = {
  punjab:         { service: "Rescue 1122",       number: "1122" },
  islamabad:      { service: "Rescue 1122",       number: "1122" },
  kp:             { service: "Rescue 1122",       number: "1122" },
  "khyber pakhtunkhwa": { service: "Rescue 1122", number: "1122" },
  sindh:          { service: "Edhi Ambulance",    number: "115" },
  balochistan:    { service: "Edhi Ambulance",    number: "115" },
};

const DEFAULT_EMERGENCY_SERVICE = { service: "Edhi Ambulance", number: "115" };

/**
 * General supportive first-aid guidance mapped to keyword categories.
 * No medication names, dosages, or specific treatment actions are included —
 * the app should never instruct a user to administer a specific drug.
 */
const FIRST_AID_INSTRUCTIONS: Record<string, string> = {
  "chest pain": "Have the person sit down, stay calm, and rest. Loosen any tight clothing. Wait for emergency responders to arrive.",
  "can't breathe": "Help the person sit upright and stay as calm as possible. Loosen any tight clothing. Stay with them until help arrives.",
  "cannot breathe": "Help the person sit upright and stay as calm as possible. Loosen any tight clothing. Stay with them until help arrives.",
  "unconscious": "Stay with the person and check if they are breathing. If breathing, place them in the recovery position. Wait for emergency responders.",
  "severe bleeding": "Apply firm pressure to the wound with a clean cloth. Keep the person still and calm. Wait for emergency responders.",
  "seizure": "Clear the area of any hazards and place something soft under the person's head. Do not restrain them. Stay with them until the seizure stops.",
  "overdose": "Stay with the person and keep them calm. Do not induce vomiting unless instructed by emergency services. Gather information about what was taken for responders.",
  "stroke": "Keep the person calm and still. Note the time symptoms started. Stay with them and wait for emergency responders.",
  "heart attack": "Have the person sit down, stay calm, and rest. Loosen any tight clothing. Stay with them until emergency responders arrive.",
  "choking": "Stay with the person and encourage them to cough. If the obstruction does not clear, wait for emergency responders.",
  "anaphylaxis": "Have the person lie down with legs elevated and keep them calm. Do not give anything to eat or drink. Wait for emergency responders.",
  "cardiac arrest": "Stay with the person. Keep them on a firm, flat surface. Wait for emergency responders to arrive.",
};

/**
 * Analyze text for emergency indicators and trigger escalation.
 *
 * @param text - Patient's message or voice transcript
 * @param requestId - Request identifier for tracing
 * @param province - Patient's province (for correct emergency service number)
 * @returns Emergency detection result with actions taken
 */
export async function executeEmergencyCheck(
  text: string,
  requestId: string,
  province?: string
): Promise<EmergencyResult> {
  const lower = text.toLowerCase();
  const emergencyService = resolveEmergencyService(province);

  // ── Check for mental health crisis first (takes priority) ──
  const mentalHealthDetected = MENTAL_HEALTH_CRISIS_KEYWORDS.filter((kw) =>
    lower.includes(kw)
  );

  if (mentalHealthDetected.length > 0) {
    // ── Mental health crisis — always CRITICAL, distinct response ──
    return {
      is_emergency: true,
      detected_keywords: [...mentalHealthDetected],
      severity: "CRITICAL",
      actions_taken: [
        "Mental health crisis protocols activated",
        "Stay with the person. Do not leave them alone. Listen without judgment.",
        // ⚠️  UNVERIFIED — This helpline number has not been independently
        // confirmed. Verify it is correct before relying on it in a live
        // demo or real use.
        "Contact Umang Pakistan mental health helpline: 0311-7786264",
        `Call ${emergencyService.service} at ${emergencyService.number} if there is immediate physical danger`,
        "Remove any potential means of self-harm from the person's surroundings",
      ],
      // Placeholder confidence for the prototype — replace with a real
      // confidence score once an actual NLP/classification model is integrated.
      confidence: 0.95,
    };
  }

  // ── Check for physical emergency keywords ──
  const detectedKeywords = EMERGENCY_KEYWORDS.filter((kw) =>
    lower.includes(kw)
  );

  const isEmergency = detectedKeywords.length > 0;

  // ── Determine severity (physical emergencies only) ──
  let severity: EmergencyResult["severity"] = "NONE";
  if (detectedKeywords.length >= 3) {
    severity = "CRITICAL";
  } else if (detectedKeywords.length >= 1) {
    severity = "HIGH";
  }

  // ── Build actions taken ──
  const actionsTaken: string[] = [];
  if (isEmergency) {
    actionsTaken.push("Emergency protocols activated");
    actionsTaken.push(
      `Call ${emergencyService.service} at ${emergencyService.number} immediately`
    );

    for (const kw of detectedKeywords) {
      const instruction = FIRST_AID_INSTRUCTIONS[kw];
      if (instruction) {
        actionsTaken.push(`Guidance: ${instruction}`);
      }
    }

    actionsTaken.push("Nearest ER lookup initiated via GeoLocator");
  }

  return {
    is_emergency: isEmergency,
    detected_keywords: [...detectedKeywords],
    severity,
    actions_taken: actionsTaken,
    // Placeholder confidence for the prototype — replace with a real
    // confidence score once an actual NLP/classification model is integrated.
    confidence: isEmergency ? 0.95 : 0.9,
  };
}

/**
 * Resolve the correct emergency service name and phone number for a province.
 * Returns the default (Edhi Ambulance 115) when province is unknown or omitted.
 */
function resolveEmergencyService(
  province?: string
): { service: string; number: string } {
  if (!province) return DEFAULT_EMERGENCY_SERVICE;
  return PROVINCE_EMERGENCY[province.toLowerCase()] ?? DEFAULT_EMERGENCY_SERVICE;
}

/**
 * Quick synchronous check — call before routing to detect if emergency
 * escalation is needed. Checks BOTH physical emergency keywords and
 * mental health crisis keywords. Returns true if either is detected.
 */
export function detectEmergency(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    EMERGENCY_KEYWORDS.some((kw) => lower.includes(kw)) ||
    MENTAL_HEALTH_CRISIS_KEYWORDS.some((kw) => lower.includes(kw))
  );
}
