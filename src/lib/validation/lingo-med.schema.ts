/**
 * Zod validation schemas for Lingo-Med AI agent.
 * Validates both incoming requests and outgoing response payloads.
 */

import { z } from "zod";
import { VoicePayloadSchema } from "./pharma-check.schema";

// ─── Request Schema ─────────────────────────────────────────────────────────

export const LingoMedRequestSchema = z.object({
  /** Base64-encoded image or PDF of the lab report */
  media_base64: z.string().min(1).optional(),
  /** URL to the lab report file */
  media_url: z.string().url().optional(),
  /** MIME type */
  media_type: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]),
  /** Optional user query (e.g., "explain my cholesterol") */
  query: z.string().max(500).optional(),
  /** User identifier */
  user_id: z.string().max(100).optional(),
  /** Optional voice input — audio or pre-transcribed text */
  voice_payload: VoicePayloadSchema.optional(),
}).refine(
  (data) => data.media_base64 || data.media_url,
  { message: "Either media_base64 or media_url must be provided" }
);

export type LingoMedRequest = z.infer<typeof LingoMedRequestSchema>;

// ─── Response Schemas ───────────────────────────────────────────────────────

export const PatientInfoSchema = z.object({
  name: z.string().optional(),
  age: z.number().int().positive().optional(),
  gender: z.string().optional(),
  report_date: z.string().optional(),
  lab_name: z.string().optional(),
});

export const LabMetricSchema = z.object({
  /** Test name (e.g., "Hemoglobin", "Fasting Glucose") */
  test_name: z.string().min(1),
  /** Measured numeric value */
  value: z.number(),
  /** Unit of measurement (e.g., "g/dL", "mg/dL") */
  unit: z.string(),
  /** Lower bound of normal reference range */
  reference_low: z.number().nullable(),
  /** Upper bound of normal reference range */
  reference_high: z.number().nullable(),
  /** Severity classification */
  severity: z.enum(["NORMAL", "BORDERLINE", "ABNORMAL", "CRITICAL"]),
});

export const MetricExplanationSchema = z.object({
  /** Which test this explanation covers */
  test_name: z.string(),
  /** Plain-language explanation */
  explanation: z.string(),
  /** Severity level */
  severity: z.enum(["NORMAL", "BORDERLINE", "ABNORMAL", "CRITICAL"]),
  /** Simple actionable suggestion */
  suggestion: z.string(),
});

export const LingoMedResultSchema = z.object({
  patient_info: PatientInfoSchema.nullable(),
  metrics: z.array(LabMetricSchema),
  flagged_metrics: z.array(LabMetricSchema),
  summary: z.string().min(1),
  explanations: z.array(MetricExplanationSchema),
});

export type LingoMedResult = z.infer<typeof LingoMedResultSchema>;

// ─── Validation Helpers ─────────────────────────────────────────────────────

export function validateLingoMedRequest(data: unknown) {
  return LingoMedRequestSchema.parse(data);
}

export function validateLingoMedResult(data: unknown) {
  return LingoMedResultSchema.parse(data);
}
