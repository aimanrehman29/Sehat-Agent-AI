/**
 * Zod validation schemas for Care-Sync AI agent.
 * Validates both incoming requests and outgoing response payloads.
 */

import { z } from "zod";
import { VoicePayloadSchema } from "./pharma-check.schema";

// ─── Request Schema ─────────────────────────────────────────────────────────

export const CareSyncParseRequestSchema = z.object({
  /** Base64-encoded image of the prescription */
  media_base64: z.string().min(1).optional(),
  /** URL to the prescription image */
  media_url: z.string().url().optional(),
  /** MIME type */
  media_type: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),
  /** Optional user query */
  query: z.string().max(500).optional(),
  /** User identifier */
  user_id: z.string().max(100).optional(),
  /** Optional voice input — audio or pre-transcribed text */
  voice_payload: VoicePayloadSchema.optional(),
}).refine(
  (data) => data.media_base64 || data.media_url,
  { message: "Either media_base64 or media_url must be provided" }
);

export type CareSyncParseRequest = z.infer<typeof CareSyncParseRequestSchema>;

// ─── Response Schemas ───────────────────────────────────────────────────────

export const ParsedMedicineSchema = z.object({
  /** Medicine name as extracted from prescription */
  name: z.string().min(1),
  /** Normalized generic name (if identifiable) */
  generic_name: z.string().nullable(),
  /** Dosage string (e.g., "500mg") */
  dosage: z.string().nullable(),
  /** Form: tablet, syrup, injection, etc. */
  form: z.string().nullable(),
  /** Frequency: twice daily, etc. */
  frequency: z.string().nullable(),
  /** Duration: 7 days, etc. */
  duration: z.string().nullable(),
  /** Special instructions: before food, etc. */
  instructions: z.string().nullable(),
});

export const DoctorInfoSchema = z.object({
  name: z.string().optional(),
  clinic: z.string().optional(),
  date: z.string().optional(),
  registration_no: z.string().optional(),
});

export const ReminderScheduleSchema = z.object({
  /** Medicine this reminder targets */
  medicine_name: z.string(),
  /** Cron expressions for scheduling */
  cron_expressions: z.array(z.string()),
  /** Human-readable description */
  schedule_description: z.string(),
  /** ISO-8601 timestamps of next scheduled times */
  next_scheduled_times: z.array(z.string()),
});

export const CareSyncResultSchema = z.object({
  medicines: z.array(ParsedMedicineSchema),
  doctor_info: DoctorInfoSchema.nullable(),
  reminders: z.array(ReminderScheduleSchema),
  raw_extracted_text: z.string(),
});

export type CareSyncResult = z.infer<typeof CareSyncResultSchema>;

// ─── Reminder CRUD Schemas ──────────────────────────────────────────────────

export const CreateReminderRequestSchema = z.object({
  user_id: z.string().min(1),
  prescription_id: z.string().min(1),
  medicine_name: z.string().min(1),
  cron_expressions: z.array(z.string().min(1)).min(1),
  timezone: z.string().default("Asia/Karachi"),
  channel: z.enum(["push", "sms", "voice"]).default("push"),
});

export type CreateReminderRequest = z.infer<typeof CreateReminderRequestSchema>;

/**
 * Schema for activating a batch of medication reminders from a parsed prescription.
 * Used by the "Set Medicine Reminders" button in the Care-Sync UI.
 */
export const ActivateRemindersRequestSchema = z.object({
  user_id: z.string().min(1),
  prescription_id: z.string().min(1),
  medicines: z.array(
    z.object({
      medicine_name: z.string().min(1),
      cron_expressions: z.array(z.string().min(1)).min(1),
      timezone: z.string().default("Asia/Karachi"),
      channel: z.enum(["push", "sms", "voice"]).default("push"),
    })
  ).min(1),
});

export type ActivateRemindersRequest = z.infer<typeof ActivateRemindersRequestSchema>;

/**
 * Schema for the reminder activation response.
 */
export const ActivateRemindersResponseSchema = z.object({
  success: z.boolean(),
  activated_count: z.number(),
  reminder_ids: z.array(z.string()),
  message: z.string(),
});

export type ActivateRemindersResponse = z.infer<typeof ActivateRemindersResponseSchema>;

// ─── Validation Helpers ─────────────────────────────────────────────────────

export function validateCareSyncParseRequest(data: unknown) {
  return CareSyncParseRequestSchema.parse(data);
}

export function validateCareSyncResult(data: unknown) {
  return CareSyncResultSchema.parse(data);
}

export function validateCreateReminderRequest(data: unknown) {
  return CreateReminderRequestSchema.parse(data);
}

export function validateActivateRemindersRequest(data: unknown) {
  return ActivateRemindersRequestSchema.parse(data);
}
