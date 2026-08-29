/**
 * Zod validation schemas for Pharma-Check AI agent.
 * Validates both incoming requests and outgoing response payloads.
 */

import { z } from "zod";

// ─── Request Schema ─────────────────────────────────────────────────────────

export const PharmaCheckRequestSchema = z.object({
  /** Base64-encoded image of medicine packaging */
  media_base64: z.string().min(1).optional(),
  /** URL to the medicine packaging image */
  media_url: z.string().url().optional(),
  /** MIME type of the image */
  media_type: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),
  /** Optional user query */
  query: z.string().max(500).optional(),
  /** User identifier */
  user_id: z.string().max(100).optional(),
}).refine(
  (data) => data.media_base64 || data.media_url,
  { message: "Either media_base64 or media_url must be provided" }
);

export type PharmaCheckRequest = z.infer<typeof PharmaCheckRequestSchema>;

// ─── Response Schemas ───────────────────────────────────────────────────────

export const RiskFactorSchema = z.object({
  description: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  weight: z.number().min(0).max(1),
});

export const RiskAssessmentSchema = z.object({
  level: z.enum(["SAFE", "LOW_RISK", "MEDIUM_RISK", "HIGH_RISK", "CRITICAL"]),
  score: z.number().min(0).max(100),
  factors: z.array(RiskFactorSchema),
});

export const DrugRegistryInfoSchema = z.object({
  drug_name: z.string(),
  registration_no: z.string(),
  manufacturer: z.string(),
  batch_number: z.string().nullable(),
  expiry_date: z.string().nullable(),
  category: z.string(),
  is_active: z.boolean(),
});

export const PharmaCheckResultSchema = z.object({
  barcode: z.string().nullable(),
  qr_data: z.string().nullable(),
  drap_registration_no: z.string().nullable(),
  drug_found: z.boolean(),
  drug_info: DrugRegistryInfoSchema.nullable(),
  risk: RiskAssessmentSchema,
  warnings: z.array(z.string()),
  // ── Updated Blueprint Fields (DRAP serialization mandate) ──
  scanned_item: z.string(),
  drap_number: z.string(),
  authenticity_status: z.enum([
    "VERIFIED",
    "COULD NOT BE VERIFIED",
    "WARNING",
  ]),
  reasoning: z.string(),
  recommended_action: z.string(),
  disclaimer: z.string(),
});

export type PharmaCheckResult = z.infer<typeof PharmaCheckResultSchema>;

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validate an incoming Pharma-Check request.
 * Throws ZodError if invalid.
 */
export function validatePharmaCheckRequest(data: unknown) {
  return PharmaCheckRequestSchema.parse(data);
}

/**
 * Validate the agent's output before wrapping in response envelope.
 */
export function validatePharmaCheckResult(data: unknown) {
  return PharmaCheckResultSchema.parse(data);
}
