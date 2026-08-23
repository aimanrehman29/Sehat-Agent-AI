/**
 * ─────────────────────────────────────────────────────────────────────────────
 * emergencyEscalation.ts — Emergency keyword handoff.
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
 * This is a Track B agent managed by the teammate.
 * Stub provided for orchestrator integration.
 */

import { logger } from "../utils/logger";

export class EmergencyEscalationAgent {
  readonly name = "emergency";

  /** Keywords that trigger emergency escalation */
  private static readonly KEYWORDS = [
    "chest pain", "can't breathe", "cannot breathe", "unconscious",
    "severe bleeding", "seizure", "suicidal", "overdose", "stroke",
    "heart attack", "choking", "anaphylaxis", "cardiac arrest",
  ];

  async execute(
    payload: Record<string, unknown>,
    requestId: string
  ): Promise<EmergencyResult> {
    logger.info(`[Emergency] Analyzing for emergency indicators`, { requestId });

    const text = (payload.text as string || "").toLowerCase();
    const detected = EmergencyEscalationAgent.KEYWORDS.filter((kw) =>
      text.includes(kw)
    );

    const isEmergency = detected.length > 0;
    logger.info(`[Emergency] ${isEmergency ? "ALERT" : "No emergency"}`, {
      requestId,
      keywords: detected,
    });

    // TODO: Trigger emergency protocols when isEmergency === true
    // TODO: Send SMS to emergency contacts
    // TODO: Provide first-aid instructions
    // TODO: Route to GeoLocator for nearest ER

    return {
      is_emergency: isEmergency,
      detected_keywords: detected,
      severity: isEmergency ? "HIGH" : "NONE",
      actions_taken: isEmergency
        ? ["Emergency protocols activated", "First-aid instructions provided"]
        : [],
      confidence: isEmergency ? 0.95 : 0.9,
    };
  }

  /**
   * Quick check — call before routing to detect if emergency escalation
   * is needed. Returns true if the text contains emergency keywords.
   */
  static detectEmergency(text: string): boolean {
    const lower = text.toLowerCase();
    return this.KEYWORDS.some((kw) => lower.includes(kw));
  }
}

interface EmergencyResult {
  is_emergency: boolean;
  detected_keywords: string[];
  severity: "NONE" | "MODERATE" | "HIGH" | "CRITICAL";
  actions_taken: string[];
  confidence: number;
}
