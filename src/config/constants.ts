/**
 * Shared constants for the Sehat-Agent AI platform (Track A).
 * All magic strings, enums, and configuration values live here.
 */

// ─── Agent Identifiers ──────────────────────────────────────────────────────

export const AGENTS = {
  PHARMA_CHECK: "pharma-check",
  LINGO_MED: "lingo-med",
  CARE_SYNC: "care-sync",
} as const;

export type AgentId = (typeof AGENTS)[keyof typeof AGENTS];

// ─── API Status Codes ───────────────────────────────────────────────────────

export const AGENT_STATUS = {
  SUCCESS: "success",
  PARTIAL: "partial",
  ERROR: "error",
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

// ─── Media Types ────────────────────────────────────────────────────────────

export const MEDIA_TYPES = {
  JPEG: "image/jpeg",
  PNG: "image/png",
  WEBP: "image/webp",
  PDF: "application/pdf",
} as const;

export type MediaType = (typeof MEDIA_TYPES)[keyof typeof MEDIA_TYPES];

// ─── Risk Levels (Pharma-Check) ─────────────────────────────────────────────

export enum RiskLevel {
  SAFE = "SAFE",
  LOW_RISK = "LOW_RISK",
  MEDIUM_RISK = "MEDIUM_RISK",
  HIGH_RISK = "HIGH_RISK",
  CRITICAL = "CRITICAL",
}

// ─── Severity Levels (Lingo-Med) ────────────────────────────────────────────

export enum MetricSeverity {
  NORMAL = "NORMAL",
  BORDERLINE = "BORDERLINE",
  ABNORMAL = "ABNORMAL",
  CRITICAL = "CRITICAL",
}

// ─── Reminder Frequencies (Care-Sync) ───────────────────────────────────────

export enum ReminderFrequency {
  ONCE_DAILY = "ONCE_DAILY",
  TWICE_DAILY = "TWICE_DAILY",
  THREE_TIMES_DAILY = "THREE_TIMES_DAILY",
  FOUR_TIMES_DAILY = "FOUR_TIMES_DAILY",
  EVERY_OTHER_DAY = "EVERY_OTHER_DAY",
  WEEKLY = "WEEKLY",
  AS_NEEDED = "AS_NEEDED",
}

// ─── Source Channels ────────────────────────────────────────────────────────

export const SOURCE_CHANNELS = {
  VOICE: "voice",
  CHAT: "chat",
  WEB: "web",
  MOBILE: "mobile",
} as const;

export type SourceChannel =
  (typeof SOURCE_CHANNELS)[keyof typeof SOURCE_CHANNELS];

// ─── Processing Limits ──────────────────────────────────────────────────────

export const LIMITS = {
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_PDF_PAGES: 20,
  OCR_TIMEOUT_MS: 30_000,
  API_TIMEOUT_MS: 60_000,
  MAX_PRESCRIPTION_ITEMS: 25,
  MAX_LAB_METRICS: 100,
} as const;

// ─── OCR Languages ──────────────────────────────────────────────────────────

export const OCR_LANGUAGES = {
  ENGLISH: "eng",
  URDU: "urd",
  ENGLISH_URDU: "eng+urd",
} as const;

// ─── Cron Defaults ──────────────────────────────────────────────────────────

/**
 * Default cron expression templates for common medication frequencies.
 * These map to ReminderFrequency enum values.
 */
export const DEFAULT_CRON_EXPRESSIONS: Record<ReminderFrequency, string[]> = {
  [ReminderFrequency.ONCE_DAILY]: ["0 8 * * *"],
  [ReminderFrequency.TWICE_DAILY]: ["0 8 * * *", "0 20 * * *"],
  [ReminderFrequency.THREE_TIMES_DAILY]: ["0 8 * * *", "0 14 * * *", "0 20 * * *"],
  [ReminderFrequency.FOUR_TIMES_DAILY]: ["0 7 * * *", "0 12 * * *", "0 17 * * *", "0 22 * * *"],
  [ReminderFrequency.EVERY_OTHER_DAY]: ["0 8 */2 * *"],
  [ReminderFrequency.WEEKLY]: ["0 8 * * 1"],
  [ReminderFrequency.AS_NEEDED]: [],
};
