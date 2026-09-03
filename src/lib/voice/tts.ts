/**
 * ─────────────────────────────────────────────────────────────────────────────
 * tts.ts — Text-to-Speech spoken summary builder.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Converts each Track A agent's structured result into a concise, naturally
 * phrased spoken sentence that can be read aloud by the browser's
 * `window.speechSynthesis` API (or any downstream TTS engine).
 *
 * Design decisions:
 *   - Server-side only (runs inside Next.js API routes / agents).
 *   - Produces plain text — no audio bytes.  Actual synthesis happens in the
 *     browser via VoiceResponsePlayer (Web Speech API) so there is zero cost
 *     and zero latency for audio generation.
 *   - `audio_url` is always null until a server-side TTS provider (e.g.
 *     OpenAI TTS, ElevenLabs) is plugged in; the field is reserved for
 *     that upgrade path.
 *   - Language is detected from the agent result context where possible;
 *     falls back to "en-US".
 *
 * Usage:
 *   import { buildAudioResponse } from "@/lib/voice/tts";
 *
 *   // Inside an agent's execute():
 *   const audioResponse = buildPharmaAudioResponse(result);
 *   return { ...result, audio_response: audioResponse };
 */

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type TtsLanguage = "en-US" | "ur-PK";

/**
 * TTS metadata attached to every Track A agent result.
 * Consumed by VoiceResponsePlayer on the client.
 */
export interface AudioResponse {
  /**
   * Concise plain-text summary to be spoken aloud.
   * Phrased as natural speech (not JSON keys, not acronyms).
   */
  text_to_speak: string;
  /**
   * Pre-generated audio URL (e.g. from a server-side TTS API).
   * null means "synthesize in the browser via speechSynthesis".
   */
  audio_url: string | null;
  /** BCP 47 language tag for the synthesis voice. */
  language: TtsLanguage;
}

// ─── Pharma-Check ─────────────────────────────────────────────────────────────

interface PharmaResultLike {
  authenticity_status: string;
  scanned_item?: string;
  recommended_action?: string;
  risk?: { level?: string };
  brand_name?: string;
  generic_name?: string;
  strength?: string;
  safety_warnings_en?: string[];
  safety_warnings_ur?: string[];
}

/**
 * Build a spoken summary for a Pharma-Check analysis result.
 *
 * Example output:
 *   "Medicine scan complete. Augmentin 625mg is VERIFIED in the DRAP registry.
 *    Risk level is low. It is safe to use as directed."
 */
export function buildPharmaAudioResponse(result: PharmaResultLike): AudioResponse {
  const item = result.scanned_item || "the scanned medicine";
  const status = normalizeStatus(result.authenticity_status);
  const risk = result.risk?.level
    ? ` Risk level is ${humanizeRisk(result.risk.level)}.`
    : "";
  const action = result.recommended_action
    ? ` ${result.recommended_action}`
    : "";

  const text = `Medicine scan complete. ${item} is ${status} in the DRAP registry.${risk}${action}`;

  return {
    text_to_speak: text.trim(),
    audio_url: null,
    language: "en-US",
  };
}

// ─── Lingo-Med ────────────────────────────────────────────────────────────────

interface LingoMetric {
  test_name: string;
  severity: string;
}

interface LingoResultLike {
  summary?: string;
  summary_en?: string;
  summary_ur?: string;
  flagged_metrics?: LingoMetric[];
  patient_info?: { name?: string } | null;
}

/**
 * Build a spoken summary for a Lingo-Med lab report result.
 *
 * Example output:
 *   "Lab report analysis complete for Ali Hassan.
 *    2 out of 4 tests need attention: Fasting Blood Glucose is abnormal,
 *    T S H is abnormal. Please consult your doctor."
 */
export function buildLingoAudioResponse(result: LingoResultLike): AudioResponse {
  const patientClause = result.patient_info?.name
    ? ` for ${result.patient_info.name}`
    : "";

  // Use agent summary if available; otherwise build from flagged metrics
  // Prefer bilingual summary_en if available, fall back to legacy summary
  const baseSummary = result.summary_en ?? result.summary;

  let text: string;
  if (baseSummary) {
    text = `Lab report analysis complete${patientClause}. ${baseSummary}`;
  } else if (result.flagged_metrics && result.flagged_metrics.length > 0) {
    const names = result.flagged_metrics
      .slice(0, 3) // cap at 3 to keep speech short
      .map((m) => `${spellAbbreviation(m.test_name)} is ${m.severity.toLowerCase()}`)
      .join(", ");
    const more = (result.flagged_metrics.length > 3)
      ? ` and ${result.flagged_metrics.length - 3} more`
      : "";
    text =
      `Lab report analysis complete${patientClause}. ` +
      `${result.flagged_metrics.length} result${result.flagged_metrics.length > 1 ? "s" : ""} ` +
      `need attention: ${names}${more}. Please consult your doctor.`;
  } else {
    text = `Lab report analysis complete${patientClause}. All results are within normal ranges.`;
  }

  return {
    text_to_speak: text.trim(),
    audio_url: null,
    language: "en-US",
  };
}

// ─── Care-Sync ────────────────────────────────────────────────────────────────

interface CareMedicine {
  name: string;
  frequency?: string | null;
  duration?: string | null;
}

interface CareResultLike {
  medicines?: CareMedicine[];
  doctor_info?: { name?: string } | null;
  prescription_id?: string | null;
  summary_en?: string;
  summary_ur?: string;
}

/**
 * Build a spoken summary for a Care-Sync prescription parse result.
 *
 * Example output:
 *   "Prescription parsed successfully. Doctor Fatima Hassan prescribed
 *    2 medicines: Augmentin 625mg twice daily for 7 days,
 *    and Risek 20mg once daily for 14 days.
 *    Your reminders are ready to be activated."
 */
export function buildCareAudioResponse(result: CareResultLike): AudioResponse {
  const doctorClause = result.doctor_info?.name
    ? ` ${result.doctor_info.name} prescribed`
    : " Your prescription contains";

  const meds = result.medicines ?? [];
  let medClause: string;

  if (meds.length === 0) {
    medClause = " No medicines were identified.";
  } else {
    const top = meds.slice(0, 3); // cap for brevity
    const list = top
      .map((m) => {
        let phrase = m.name;
        if (m.frequency) phrase += ` ${m.frequency}`;
        if (m.duration) phrase += ` for ${m.duration}`;
        return phrase;
      })
      .join(", ");
    const more = meds.length > 3 ? ` and ${meds.length - 3} more` : "";
    medClause =
      ` ${meds.length} medicine${meds.length > 1 ? "s" : ""}: ${list}${more}.`;
  }

  const reminderClause = result.prescription_id
    ? " Your reminders are ready to be activated."
    : "";

  // Prefer bilingual summary if available
  const baseText = result.summary_en
    ? `Prescription parsed successfully. ${result.summary_en}`
    : `Prescription parsed successfully.${doctorClause}${medClause}${reminderClause}`;

  return {
    text_to_speak: baseText.trim(),
    audio_url: null,
    language: result.summary_ur ? "ur-PK" : "en-US",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map machine status strings to natural spoken phrases. */
function normalizeStatus(status: string): string {
  switch (status?.toUpperCase()) {
    case "VERIFIED":
      return "verified";
    case "WARNING":
      return "partially matched — please verify";
    case "COULD NOT BE VERIFIED":
    default:
      return "not found";
  }
}

/** Map risk level codes to natural spoken phrases. */
function humanizeRisk(level: string): string {
  switch (level?.toUpperCase()) {
    case "SAFE":        return "safe";
    case "LOW_RISK":    return "low";
    case "MEDIUM_RISK": return "moderate";
    case "HIGH_RISK":   return "high";
    case "CRITICAL":    return "critical";
    default:            return level.toLowerCase();
  }
}

/**
 * Spell out short abbreviations so TTS doesn't read them as words.
 * e.g. "TSH" → "T S H", "WBC" → "W B C"
 * Longer terms are passed through unchanged.
 */
function spellAbbreviation(name: string): string {
  if (/^[A-Z]{2,5}$/.test(name.trim())) {
    return name.trim().split("").join(" ");
  }
  return name;
}
