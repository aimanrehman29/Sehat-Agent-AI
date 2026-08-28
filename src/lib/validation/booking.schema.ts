/**
 * Zod validation schemas for Auto-Booking AI agent (Track B).
 * Validates both incoming booking requests and outgoing E-Parchi payloads.
 */

import { z } from "zod";

// ─── Request Schema ─────────────────────────────────────────────────────────

export const BookingRequestSchema = z.object({
  /** Full name of the patient */
  patientName: z.string().min(1, "Patient name must not be empty").max(200),
  /** Target medical department (e.g., "Cardiology", "Orthopedics") */
  department: z.string().min(1, "Department must not be empty").max(200),
  /** Hospital or clinic name */
  hospitalName: z.string().min(1, "Hospital name must not be empty").max(300),
  /** Requested appointment date and time (ISO 8601 string, e.g. "2026-09-01T10:00:00Z") */
  requestedTime: z
    .string()
    .min(1, "Requested time must not be empty")
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "requestedTime must be a valid ISO 8601 date string",
    }),
  /** User identifier */
  user_id: z.string().max(100).optional(),
  /** Session identifier for multi-turn conversations */
  session_id: z.string().max(100).optional(),
});

export type BookingRequest = z.infer<typeof BookingRequestSchema>;

// ─── Response Schemas (E-Parchi) ────────────────────────────────────────────

export const BookingResultSchema = z.object({
  /** Patient name for the appointment */
  patient_name: z.string().min(1),
  /** Hospital or clinic name */
  hospital_name: z.string().min(1),
  /** Target department */
  department: z.string().min(1),
  /** Requested appointment date (ISO 8601 date) */
  requested_date: z.string().min(1),
  /** Requested appointment time (HH:mm format) */
  requested_time: z.string().min(1),
  /** Current booking status */
  status: z.enum(["CALL_INITIATED", "CALL_COMPLETED", "CALL_FAILED"]),
  /** Twilio call SID for tracing */
  call_sid: z.string().nullable(),
  /** Destination number the call was placed to (always the test number in prototype) */
  call_destination: z.string().min(1),
  /** Prototype safety note */
  prototype_note: z.string().min(1),
  /** Confidence score (0–1) */
  confidence: z.number().min(0).max(1),
});

export type BookingResult = z.infer<typeof BookingResultSchema>;

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validate an incoming Booking request.
 * Throws ZodError if invalid.
 */
export function validateBookingRequest(data: unknown) {
  return BookingRequestSchema.parse(data);
}

/**
 * Validate the agent's E-Parchi output before wrapping in response envelope.
 */
export function validateBookingResult(data: unknown) {
  return BookingResultSchema.parse(data);
}
