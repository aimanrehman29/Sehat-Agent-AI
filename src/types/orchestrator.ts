/**
 * Orchestrator types — standardized envelopes for Track A ↔ Track B handoffs.
 *
 * Every request FROM the orchestrator arrives in a UniversalRequest envelope.
 * Every response TO the orchestrator leaves in a UniversalResponse envelope.
 */

import type {
  AgentId,
  AgentStatus,
  SourceChannel,
  MediaType,
} from "@/config/constants";

// ─── Universal Request Envelope ─────────────────────────────────────────────

/**
 * Incoming request from the Orchestrator (or Track B).
 * All three Track A agents receive this envelope shape.
 */
export interface UniversalRequest {
  /** Unique request identifier (UUID v4) */
  request_id: string;
  /** Session identifier for multi-turn conversations */
  session_id: string;
  /** Which agent should handle this request */
  agent_target: AgentId;
  /** Origin channel that initiated the request */
  source_channel: SourceChannel;
  /** Media payload (image/PDF) */
  payload: RequestPayload;
  /** Optional conversational and user context */
  context?: RequestContext;
  /** ISO-8601 timestamp of request creation */
  timestamp: string;
}

export interface RequestPayload {
  /** MIME type of the uploaded media */
  media_type: MediaType;
  /** URL to the media file (preferred for large files) */
  media_url?: string;
  /** Base64-encoded media data (for small payloads only) */
  media_base64?: string;
  /** Additional metadata about the request */
  metadata?: Record<string, unknown>;
}

export interface RequestContext {
  /** Prior conversation messages for continuity */
  conversation_history?: ConversationMessage[];
  /** User profile information (if available) */
  user_profile?: UserProfile;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface UserProfile {
  user_id?: string;
  age?: number;
  gender?: string;
  name?: string;
  location?: string;
}

// ─── Universal Response Envelope ────────────────────────────────────────────

/**
 * Outgoing response to the Orchestrator (→ Track B).
 * Every Track A agent MUST return this envelope shape.
 * The `guardrails` field is always populated by the disclaimer wrapper.
 */
export interface UniversalResponse<T = AgentResultPayload> {
  /** Echoes back the original request_id */
  request_id: string;
  /** Which agent produced this response */
  agent_source: AgentId;
  /** Processing outcome */
  status: AgentStatus;
  /** Agent-specific result payload */
  result: T;
  /** Guardrail metadata — always present, never optional */
  guardrails: GuardrailPayload;
  /** Overall confidence score (0.0 – 1.0) */
  confidence_score: number;
  /** Total processing time in milliseconds */
  processing_time_ms: number;
  /** ISO-8601 timestamp of response creation */
  timestamp: string;
}

export interface GuardrailPayload {
  /** Whether the mandatory disclaimer was applied */
  disclaimer_applied: true; // Must always be true — never false in production
  /** The exact disclaimer text appended */
  disclaimer_text: string;
  /** Additional guardrail metadata */
  version: string;
}

/**
 * Generic agent result payload — each agent extends this with specifics.
 */
export type AgentResultPayload =
  | PharmaCheckResult
  | LingoMedResult
  | CareSyncResult;

// ─── Pharma-Check Result ────────────────────────────────────────────────────

export interface PharmaCheckResult {
  /** Extracted barcode value (if found) */
  barcode: string | null;
  /** Extracted QR code data (if found) */
  qr_data: string | null;
  /** Extracted DRAP registration number */
  drap_registration_no: string | null;
  /** Whether the drug was found in the DRAP registry */
  drug_found: boolean;
  /** Drug details from registry (if found) */
  drug_info: DrugRegistryInfo | null;
  /** Calculated risk assessment */
  risk: RiskAssessment;
  /** Human-readable warnings */
  warnings: string[];
}

export interface DrugRegistryInfo {
  drug_name: string;
  registration_no: string;
  manufacturer: string;
  batch_number: string | null;
  expiry_date: string | null;
  category: string;
  is_active: boolean;
}

export interface RiskAssessment {
  /** Risk level classification */
  level: "SAFE" | "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK" | "CRITICAL";
  /** Numeric risk score (0–100) */
  score: number;
  /** Detailed breakdown of risk factors */
  factors: RiskFactor[];
}

export interface RiskFactor {
  description: string;
  severity: "info" | "warning" | "critical";
  weight: number;
}

// ─── Lingo-Med Result ───────────────────────────────────────────────────────

export interface LingoMedResult {
  /** Patient information extracted from the report */
  patient_info: PatientInfo | null;
  /** All extracted lab metrics */
  metrics: LabMetric[];
  /** Metrics flagged as out of range */
  flagged_metrics: LabMetric[];
  /** Plain-language summary of the entire report */
  summary: string;
  /** Simplified explanations for each flagged metric */
  explanations: MetricExplanation[];
}

export interface PatientInfo {
  name?: string;
  age?: number;
  gender?: string;
  report_date?: string;
  lab_name?: string;
}

export interface LabMetric {
  /** Name of the test (e.g., "Hemoglobin") */
  test_name: string;
  /** Measured value */
  value: number;
  /** Unit of measurement (e.g., "g/dL") */
  unit: string;
  /** Normal reference range (low) */
  reference_low: number | null;
  /** Normal reference range (high) */
  reference_high: number | null;
  /** Severity classification */
  severity: "NORMAL" | "BORDERLINE" | "ABNORMAL" | "CRITICAL";
}

export interface MetricExplanation {
  /** Which metric this explains */
  test_name: string;
  /** Plain-language explanation */
  explanation: string;
  /** Severity level */
  severity: "NORMAL" | "BORDERLINE" | "ABNORMAL" | "CRITICAL";
  /** Simple actionable suggestion */
  suggestion: string;
}

// ─── Care-Sync Result ───────────────────────────────────────────────────────

export interface CareSyncResult {
  /** All medicines extracted from the prescription */
  medicines: ParsedMedicine[];
  /** Doctor information (if legible) */
  doctor_info: DoctorInfo | null;
  /** Generated reminder schedules */
  reminders: ReminderSchedule[];
  /** Raw OCR text (for debugging / verification) */
  raw_extracted_text: string;
}

export interface ParsedMedicine {
  /** Medicine name as extracted */
  name: string;
  /** Normalized/generic name (if identifiable) */
  generic_name: string | null;
  /** Dosage (e.g., "500mg") */
  dosage: string | null;
  /** Form (e.g., "tablet", "syrup", "injection") */
  form: string | null;
  /** Frequency (e.g., "twice daily") */
  frequency: string | null;
  /** Duration (e.g., "7 days") */
  duration: string | null;
  /** Special instructions (e.g., "before food") */
  instructions: string | null;
}

export interface DoctorInfo {
  name?: string;
  clinic?: string;
  date?: string;
  registration_no?: string;
}

export interface ReminderSchedule {
  /** Which medicine this reminder is for */
  medicine_name: string;
  /** Cron expressions for this medicine */
  cron_expressions: string[];
  /** Human-readable schedule description */
  schedule_description: string;
  /** Next scheduled times */
  next_scheduled_times: string[];
}

// ─── Error Response ─────────────────────────────────────────────────────────

export interface AgentErrorResponse {
  request_id: string;
  agent_source: AgentId;
  status: "error";
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  guardrails: GuardrailPayload;
  processing_time_ms: number;
  timestamp: string;
}
