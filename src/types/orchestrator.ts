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
import type { DoctorLookupResult } from "@/agents/track-b/doctorLookup";
import type { FallbackResult } from "@/lib/orchestrator/fallbackAssistant";

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
  | CareSyncResult
  | TriageResult
  | GeoLocatorResult
  | EmergencyResult
  | BookingResult
  | VoiceTranscriptionResult
  | ChatReplyResult
  | DoctorLookupResult
  | FallbackResult;

// ─── Voice Transcription Result ─────────────────────────────────────────────

/** Result shape for the /api/track-a/voice/transcribe endpoint. */
export interface VoiceTranscriptionResult {
  /** Transcribed text (empty string if transcription was unavailable). */
  transcript: string;
  /** Source of the transcript. */
  source: "pre_transcribed" | "gemini" | "whisper" | "none";
  /** Language code detected by the transcription provider (e.g. "en", "ur"). */
  detected_language?: string;
}

// ─── Follow-Up Chat Result ──────────────────────────────────────────────────

/** Result shape for the /api/track-a/chat endpoint (contextual follow-up chat). */
export interface ChatReplyResult {
  /** The generated follow-up answer, grounded in the initial analysis context. */
  reply: string;
  /** Echoes back the session_id from the request. */
  session_id: string;
  /** Which Track A agent's context this conversation is anchored to. */
  agent_target: "pharma-check" | "lingo-med" | "care-sync";
  /** Total messages in the conversation including this reply. */
  message_count: number;
  /** Optional TTS text for auto-dictation of the reply. */
  audio_response?: AudioResponse;
}

// ─── Voice TTS Metadata ──────────────────────────────────────────────────────

/**
 * Optional TTS metadata attached to every Track A agent result.
 * When present, VoiceResponsePlayer reads the `text_to_speak` field aloud
 * via the browser's speechSynthesis API (or an audio_url if pre-generated).
 */
export interface AudioResponse {
  /** Concise plain-text summary to be spoken aloud. */
  text_to_speak: string;
  /**
   * Pre-generated audio file URL (e.g. from a server-side TTS API).
   * null = synthesize in the browser via window.speechSynthesis.
   */
  audio_url: string | null;
  /** BCP 47 language tag for the synthesis voice. */
  language: "en-US" | "ur-PK";
}

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

  // ── Updated Blueprint Fields (DRAP serialization mandate) ──
  /** Name/description of the scanned item */
  scanned_item: string;
  /** DRAP number extracted from packaging */
  drap_number: string;
  /** Authenticity status per DRAP verification */
  authenticity_status: AuthenticityStatus;
  /** Human-readable reasoning for the authenticity determination */
  reasoning: string;
  /** Recommended action for the user */
  recommended_action: string;
  /** Mandatory disclaimer text */
  disclaimer: string;
  /** Vision-extracted brand name */
  brand_name?: string | null;
  /** Vision-extracted generic name */
  generic_name?: string | null;
  /** Vision-extracted dosage strength */
  strength?: string | null;
  /** Verification status (VERIFIED/UNVERIFIED) */
  verification_status?: string;
  /** English safety warnings */
  safety_warnings_en?: string[];
  /** Urdu safety warnings */
  safety_warnings_ur?: string[];
  /** English summary */
  summary_en?: string;
  /** Urdu summary */
  summary_ur?: string;
  /** Optional TTS spoken summary — populated by the agent, consumed by VoiceResponsePlayer */
  audio_response?: AudioResponse;
}

/**
 * DRAP authenticity status categories.
 */
export type AuthenticityStatus =
  | "VERIFIED"
  | "COULD NOT BE VERIFIED"
  | "WARNING";

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
  explanations?: MetricExplanation[];
  /** Report type (e.g. Complete Blood Count) */
  report_type?: string;
  /** Key findings from the report */
  key_findings?: Array<{ test_name: string; severity: string; explanation: string }>;
  /** English summary */
  summary_en?: string;
  /** Urdu summary (اردو خلاصہ) */
  summary_ur?: string;
  /** Text for TTS spoken summary */
  audio_text?: string;
  /** Optional TTS spoken summary */
  audio_response?: AudioResponse;
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
  /** Prescription database ID (if persisted) */
  prescription_id?: string | null;
  /** Confidence score */
  confidence?: number;
  /** English summary */
  summary_en?: string;
  /** Urdu summary (اردو خلاصہ) */
  summary_ur?: string;
  /** Optional TTS spoken summary */
  audio_response?: AudioResponse;
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

// ─── Triage Result (Track B) ────────────────────────────────────────────────

export interface TriageResult {
  /** Recommended medical department */
  department: string;
  /** Urgency classification */
  urgency: "LOW" | "MODERATE" | "HIGH" | "EMERGENCY";
  /** Suggested specialist (if applicable) */
  suggested_specialist: string | null;
  /** Recommended action */
  action: string;
  /** Symptom keywords detected */
  keywords_detected: string[];
  /** Suggested GeoLocator ranking preference based on symptom text */
  suggested_location_preference: "nearest" | "best" | "balanced";
  /** Confidence score (0–1) */
  confidence: number;
  /** Emergency escalation result — populated when urgency is HIGH */
  emergency_escalation?: EmergencyResult;
}

// ─── GeoLocator Result (Track B) ────────────────────────────────────────────

export interface GeoLocatorResult {
  /** Nearby facilities found */
  facilities: Facility[];
  /** Name of the closest facility confirmed open right now, or null if none */
  nearest_open_facility: string | null;
  /** Search radius in kilometers actually used (10 for nearest, 25 for best/balanced) */
  search_radius_km: number;
  /** Origin location used for the search */
  location: { latitude: number; longitude: number };
  /** Disclaimer about open_now reflecting general hours, not ER staffing */
  open_hours_disclaimer: string;
  /** Which ranking strategy was applied to sort the results */
  ranking_strategy_used: "nearest" | "best" | "balanced";
  /** Confidence score (0–1) */
  confidence: number;
}

export interface Facility {
  name: string;
  type: string;
  address: string;
  distance_km: number;
  rating: number | null;
  phone: string | null;
  open_now?: boolean;
  /** True when Google has no opening-hours data for this facility */
  hours_unverified?: boolean;
  /** Advisory note when opening hours could not be confirmed */
  hours_note?: string;
  /** Estimated driving time in minutes (from Distance Matrix API), null if unavailable */
  travel_time_minutes?: number | null;
  /** Human-readable driving time (e.g. "12 mins"), null if unavailable */
  travel_time_text?: string | null;
  /** Google Maps navigation URL for driving directions to this facility */
  navigation_link?: string;
}

// ─── Emergency Result (Track B) ─────────────────────────────────────────────

export interface EmergencyResult {
  /** Whether an emergency was detected */
  is_emergency: boolean;
  /** Emergency keywords found in the input */
  detected_keywords: string[];
  /** Severity classification */
  severity: "NONE" | "MODERATE" | "HIGH" | "CRITICAL";
  /** Actions that were triggered */
  actions_taken: string[];
  /** Confidence score (0–1) */
  confidence: number;
}

// ─── Booking Result (Track B — Auto-Booking) ─────────────────────────────────

export interface BookingResult {
  /** Patient name for the appointment */
  patient_name: string;
  /** Hospital or clinic name */
  hospital_name: string;
  /** Target department (e.g. Cardiology, Orthopedics) */
  department: string;
  /** Requested appointment date (ISO 8601 date) */
  requested_date: string;
  /** Requested appointment time (HH:mm format) */
  requested_time: string;
  /** Current booking status */
  status: "CALL_INITIATED" | "CONFIRMED" | "CALL_COMPLETED" | "CALL_FAILED";
  /** Twilio call SID for tracing */
  call_sid: string | null;
  /** Destination number the call was placed to (always the test number in prototype) */
  call_destination: string;
  /** Prototype safety note — call routed to test number, not the real hospital line */
  prototype_note: string;
  /** Raw transcription of the receptionist's spoken response (for audit/transparency) */
  raw_receptionist_response?: string;
  /** Distance to the hospital in km (from GeoLocator, if provided by the caller) */
  distance_km?: number;
  /** E-Parchi display message (e.g. "Show this pass at counter" when confirmed) */
  e_parchi_message?: string;
  /** Call origin — "twilio" for real Twilio calls, "simulated" for browser Web Speech API demo */
  source?: "twilio" | "simulated";
  /** Confidence score (0–1) */
  confidence: number;
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
