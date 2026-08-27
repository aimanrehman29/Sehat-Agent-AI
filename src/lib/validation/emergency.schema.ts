/**
 * Zod validation schemas for Emergency Escalation AI agent (Track B).
 * Validates both incoming requests and outgoing response payloads.
 */

import { z } from "zod";

// ─── Request Schema ─────────────────────────────────────────────────────────

export const EmergencyRequestSchema = z.object({
  /** Free-text message or voice transcript to analyze for emergency indicators */
  text: z.string().min(1, "Text must not be empty").max(5000),
  /** User identifier */
  user_id: z.string().max(100).optional(),
  /** Session identifier for multi-turn conversations */
  session_id: z.string().max(100).optional(),
});

export type EmergencyRequest = z.infer<typeof EmergencyRequestSchema>;

// ─── Response Schemas ───────────────────────────────────────────────────────

export const EmergencyResultSchema = z.object({
  /** Whether an emergency was detected */
  is_emergency: z.boolean(),
  /** Emergency keywords found in the input */
  detected_keywords: z.array(z.string()),
  /** Severity classification */
  severity: z.enum(["NONE", "MODERATE", "HIGH", "CRITICAL"]),
  /** Actions that were triggered */
  actions_taken: z.array(z.string()),
  /** Confidence score (0–1) */
  confidence: z.number().min(0).max(1),
});

export type EmergencyResult = z.infer<typeof EmergencyResultSchema>;

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validate an incoming Emergency request.
 * Throws ZodError if invalid.
 */
export function validateEmergencyRequest(data: unknown) {
  return EmergencyRequestSchema.parse(data);
}

/**
 * Validate the agent's output before wrapping in response envelope.
 */
export function validateEmergencyResult(data: unknown) {
  return EmergencyResultSchema.parse(data);
}
