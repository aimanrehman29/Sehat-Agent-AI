/**
 * Zod validation schemas for Triage AI agent (Track B).
 * Validates both incoming requests and outgoing response payloads.
 */

import { z } from "zod";

// ─── Request Schema ─────────────────────────────────────────────────────────

export const TriageRequestSchema = z.object({
  /** Free-text symptom description from the patient */
  text: z.string().min(1, "Symptom description must not be empty").max(2000),
  /** User identifier */
  user_id: z.string().max(100).optional(),
  /** Session identifier for multi-turn conversations */
  session_id: z.string().max(100).optional(),
});

export type TriageRequest = z.infer<typeof TriageRequestSchema>;

// ─── Response Schemas ───────────────────────────────────────────────────────

/**
 * Nested schema for the emergency escalation payload that may accompany
 * a HIGH-urgency triage result. Mirrors EmergencyResultSchema from
 * emergency.schema.ts but is defined inline here to avoid circular imports.
 */
const EmergencyEscalationSchema = z.object({
  is_emergency: z.boolean(),
  detected_keywords: z.array(z.string()),
  severity: z.enum(["NONE", "MODERATE", "HIGH", "CRITICAL"]),
  actions_taken: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const TriageResultSchema = z.object({
  /** Recommended medical department */
  department: z.string().min(1),
  /** Urgency classification */
  urgency: z.enum(["LOW", "MODERATE", "HIGH", "EMERGENCY"]),
  /** Suggested specialist (if applicable) */
  suggested_specialist: z.string().nullable(),
  /** Recommended action */
  action: z.string().min(1),
  /** Symptom keywords detected */
  keywords_detected: z.array(z.string()),
  /** Suggested GeoLocator ranking preference based on symptom text */
  suggested_location_preference: z.enum(["nearest", "best", "balanced"]),
  /** Confidence score (0–1) */
  confidence: z.number().min(0).max(1),
  /** Emergency escalation result — populated when urgency is HIGH */
  emergency_escalation: EmergencyEscalationSchema.optional(),
});

export type TriageResult = z.infer<typeof TriageResultSchema>;

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validate an incoming Triage request.
 * Throws ZodError if invalid.
 */
export function validateTriageRequest(data: unknown) {
  return TriageRequestSchema.parse(data);
}

/**
 * Validate the agent's output before wrapping in response envelope.
 */
export function validateTriageResult(data: unknown) {
  return TriageResultSchema.parse(data);
}
