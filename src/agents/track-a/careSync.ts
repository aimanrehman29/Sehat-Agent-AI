/**
 * ─────────────────────────────────────────────────────────────────────────────
 * careSync.ts — Prescription parser & reminder scheduling with Vision AI.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Care-Sync AI parses doctor prescriptions (parchi) from images using a
 * vision-capable LLM and generates structured medication data + cron-based
 * reminder schedules.
 *
 * Pipeline:
 *   1. Send prescription image to Vision AI for handwritten OCR
 *   2. Extract medicine names, dosages, frequencies, durations
 *   3. Generate cron expressions for each medicine schedule
 *   4. Persist prescriptions in Prescription + PrescriptionItem models
 *   5. Create actionable MedicationReminder records
 *
 * Guardrail:
 *   Never fallback to hardcoded medicine data.  If the image is unreadable,
 *   return a bilingual error asking for a clearer image.
 */

import { prisma, isDbAvailable } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  transcribeVoicePayload,
  type VoicePayload,
} from "@/lib/voice/transcriber";
import { buildCareAudioResponse, type AudioResponse } from "@/lib/voice/tts";
import {
  analyzeImageWithVision,
  parseVisionJson,
} from "@/lib/agents/visionClient";

// ─── Cron Defaults ──────────────────────────────────────────────────────

const CRON_MAP: Record<string, string[]> = {
  "once daily": ["0 8 * * *"],
  "twice daily": ["0 8 * * *", "0 20 * * *"],
  "three times daily": ["0 8 * * *", "0 14 * * *", "0 20 * * *"],
  "four times daily": ["0 7 * * *", "0 12 * * *", "0 17 * * *", "0 22 * * *"],
  "every other day": ["0 8 */2 * *"],
  "weekly": ["0 8 * * 1"],
  "as needed": [],
};

// ─── System Prompt ──────────────────────────────────────────────────────

const CARE_SYNC_SYSTEM_PROMPT = `You are Care-Sync AI, a prescription parsing assistant for the Sehat-Agent AI platform in Pakistan.

Your task is to read doctor prescription images (parchi) — often handwritten — and extract ALL visible medications with their details.

IMPORTANT RULES:
- First verify: is this a valid prescription image? If NOT (e.g., random photo, lab report, medicine packaging, newspaper), set "is_valid_medical_doc" to false and stop.
- Extract EVERY medicine visible in the image: name, dosage, form (Tablet/Capsule/Syrup/Injection/Drops/Inhaler/Cream), frequency, duration, and instructions.
- Handle Pakistani medical shorthand: "1+0+1" = twice daily, "BD" = twice daily, "TDS" = three times daily, "OD" = once daily, "QDS" = four times daily.
- Handle Latin abbreviations: "AF" = after food, "BF" = before food, "HS" = at bedtime, "PRN" = as needed.
- If the handwriting is COMPLETELY unreadable, set "is_readable" to false.
- Never invent medicines that are not visible in the image.
- Always provide summaries in BOTH English and Urdu (Nastaliq script).
- CONTROLLED SUBSTANCES: Set "has_high_risk_flag" to true if ANY extracted medicine is a controlled substance or narcotic. Controlled substances include: Morphine, Codeine, Tramadol, Fentanyl, Oxycodone, Hydrocodone, Diazepam, Alprazolam, Clonazepam, Lorazepam, Midazolam, Pentazocine, Phenytoin, Phenobarbital, and any medicine listed in Pakistan's narcotics/psychotropic schedules.
- If has_high_risk_flag is true, include a safety warning in both languages about strict doctor supervision.

You MUST respond with valid JSON in this exact structure:
{
  "is_valid_medical_doc": true,
  "is_readable": true,
  "medications": [
    {
      "name": "Augmentin",
      "generic_name": "Amoxicillin + Clavulanic Acid",
      "dosage": "625mg",
      "form": "tablet",
      "frequency": "twice daily",
      "duration": "7 days",
      "instructions": "take after food",
      "scheduled_times": ["08:00", "20:00"],
      "times_per_day": 2
    }
  ],
  "doctor_info": {
    "name": "Dr. ...",
    "clinic": "...",
    "date": "...",
    "registration_no": "PMDC-..."
  },
  "schedules": [
    {
      "medicine_name": "Augmentin",
      "frequency": "twice daily",
      "cron_expressions": ["0 8 * * *", "0 20 * * *"],
      "schedule_description": "twice daily for 7 days"
    }
  ],
  "has_high_risk_flag": false,
  "summary_en": "English summary of the prescription.",
  "summary_ur": "اردو میں نسخے کا خلاصہ۔"
}

If the image is NOT a valid prescription:
{
  "is_valid_medical_doc": false,
  "summary_en": "The uploaded image does not appear to be a medical report, prescription, or medicine package.",
  "summary_ur": "اپ لوڈ کی گئی تصویر طبی رپورٹ، نسخہ یا دوا کا پیکٹ نہیں لگتی۔",
  "has_high_risk_flag": false
}

If the prescription is unreadable:
{
  "is_valid_medical_doc": true,
  "is_readable": false,
  "summary_en": "The handwritten prescription is unreadable. Please upload a clearer image.",
  "summary_ur": "نسخہ کا تحریر واضح نہیں ہے۔ براہ کرم صاف تصویر اپلوڈ کریں۔",
  "has_high_risk_flag": false
}`;

// ─── Agent Class ────────────────────────────────────────────────────────

export class CareSyncAgent {
  readonly name = "care-sync";

  async execute(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<CareSyncResult> {
    logger.info("[CareSync] Starting prescription parse", { requestId });

    const imageBase64 = payload.media_base64 as string | undefined;
    const mimeType = (payload.media_type as string) ?? "image/jpeg";
    const userId = (payload.user_id as string) ?? "anonymous";

    // ── Merge voice transcript ──
    let voiceContext = "";
    const voicePayload = payload.voice_payload as VoicePayload | undefined;
    if (voicePayload) {
      const transcription = await transcribeVoicePayload(voicePayload, requestId);
      if (transcription.transcript) {
        voiceContext = transcription.transcript;
        logger.info(
          `[CareSync] Voice transcript merged (${transcription.source})`,
          { requestId },
        );
      }
    }

    // ── Vision AI — primary analysis path ──
    if (imageBase64) {
      const visionResult = await this.analyzeWithVision(
        imageBase64,
        mimeType,
        voiceContext,
        userId,
        requestId,
      );
      if (visionResult) return visionResult;
    }

    // ── No image or Vision failed — return unreadable error ──
    logger.warn("[CareSync] No image or vision analysis failed", { requestId });
    return buildUnreadableResult();
  }

  // ── Vision AI Analysis ────────────────────────────────────────────

  private async analyzeWithVision(
    imageBase64: string,
    mimeType: string,
    voiceContext: string,
    userId: string,
    requestId: string,
  ): Promise<CareSyncResult | null> {
    const userPrompt = voiceContext
      ? `Parse this prescription image. Additional voice context: "${voiceContext}"`
      : "Parse this prescription image. Extract all medications, dosages, frequencies, and durations.";

    const visionResponse = await analyzeImageWithVision({
      imageBase64,
      mimeType,
      systemPrompt: CARE_SYNC_SYSTEM_PROMPT,
      userPrompt,
      requestId,
      jsonResponse: true,
    });

    if (!visionResponse) {
      logger.warn("[CareSync] Vision analysis unavailable", { requestId });
      return null;
    }

    const parsed = parseVisionJson<VisionLLMResponse>(visionResponse.text);
    if (!parsed) {
      logger.warn("[CareSync] Vision response JSON parse failed", { requestId });
      return null;
    }

    // Non-medical document rejection
    if (parsed.is_valid_medical_doc === false) {
      logger.info("[CareSync] Image classified as non-prescription — rejected", { requestId });
      return {
        medicines: [],
        doctor_info: null,
        reminders: [],
        raw_extracted_text: "",
        prescription_id: null,
        is_valid_medical_doc: false,
        has_high_risk_flag: false,
        summary_en: parsed.summary_en ?? "The uploaded image does not appear to be a medical report, prescription, or medicine package.",
        summary_ur: parsed.summary_ur ?? "اپ لوڈ کی گئی تصویر طبی رپورٹ، نسخہ یا دوا کا پیکٹ نہیں لگتی۔",
        confidence: 0.95,
        audio_response: buildCareAudioResponse({
          medicines: [],
          doctor_info: null,
          prescription_id: null,
          summary_en: parsed.summary_en,
          summary_ur: parsed.summary_ur,
        }),
      };
    }

    // Unreadable prescription
    if (parsed.is_readable === false) {
      logger.info("[CareSync] Prescription classified as unreadable", { requestId });
      return {
        medicines: [],
        doctor_info: null,
        reminders: [],
        raw_extracted_text: "",
        prescription_id: null,
        is_valid_medical_doc: true,
        has_high_risk_flag: false,
        summary_en: parsed.summary_en ?? "The handwritten prescription is unreadable. Please upload a clearer image.",
        summary_ur: parsed.summary_ur ?? "نسخہ کا تحریر واضح نہیں ہے۔ براہ کرم صاف تصویر اپلوڈ کریں۔",
        confidence: 0.5,
        audio_response: buildCareAudioResponse({
          medicines: [],
          doctor_info: null,
          prescription_id: null,
          summary_en: parsed.summary_en,
          summary_ur: parsed.summary_ur,
        }),
      };
    }

    // Build structured medicines
    const medicines: ParsedMedicine[] = (parsed.medications ?? []).map((m) => ({
      name: m.name,
      generic_name: m.generic_name ?? null,
      dosage: m.dosage ?? null,
      form: m.form ?? null,
      frequency: normalizeFrequency(m.frequency),
      duration: m.duration ?? null,
      instructions: m.instructions ?? null,
      scheduled_times: m.scheduled_times ?? [],
      times_per_day: m.times_per_day ?? 0,
    }));

    const doctorInfo = parsed.doctor_info ?? null;

    // Generate reminder schedules
    const reminders = medicines.map((med) => this.generateReminder(med));

    // Persist to database
    const prescriptionId = await this.persistPrescription(
      userId,
      "",
      doctorInfo,
      medicines,
      requestId,
    );

    const summaryEn = parsed.summary_en ?? `Prescription parsed: ${medicines.length} medicine(s) found.`;
    const summaryUr = parsed.summary_ur ?? "نسخہ کامیابی سے پڑھ لیا گیا۔";

    logger.info(
      `[CareSync] Vision analysis complete — ${medicines.length} medicines, ${reminders.length} reminders`,
      { requestId },
    );

    return {
      medicines,
      doctor_info: doctorInfo,
      reminders,
      raw_extracted_text: "",
      prescription_id: prescriptionId,
      is_valid_medical_doc: true,
      has_high_risk_flag: parsed.has_high_risk_flag ?? false,
      summary_en: summaryEn,
      summary_ur: summaryUr,
      confidence: 0.93,
      audio_response: buildCareAudioResponse({
        medicines,
        doctor_info: doctorInfo,
        prescription_id: prescriptionId,
        summary_en: summaryEn,
        summary_ur: summaryUr,
      }),
    };
  }

  // ── Reminder Generation ──────────────────────────────────────────

  private generateReminder(medicine: ParsedMedicine): ReminderSchedule {
    const freq = (medicine.frequency || "once daily").toLowerCase();
    const crons = CRON_MAP[freq] || ["0 8 * * *"];

    return {
      medicine_name: medicine.name,
      cron_expressions: crons,
      schedule_description: this.describeSchedule(freq, medicine.duration),
      next_scheduled_times: this.calculateNextTimes(crons),
    };
  }

  private describeSchedule(frequency: string, duration: string | null): string {
    const dur = duration ? ` for ${duration}` : "";
    return `${frequency}${dur}`;
  }

  private calculateNextTimes(crons: string[]): string[] {
    if (crons.length === 0) return [];

    const now = new Date();
    const times: string[] = [];

    for (const cron of crons) {
      const parts = cron.split(" ");
      const hour = parseInt(parts[1], 10);
      if (isNaN(hour)) continue;

      const next = new Date(now);
      next.setHours(hour, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      times.push(next.toISOString());
    }

    return times;
  }

  // ── Database Persistence ──────────────────────────────────────────

  private async persistPrescription(
    userId: string,
    rawText: string,
    doctorInfo: DoctorInfo | null,
    medicines: ParsedMedicine[],
    requestId: string,
  ): Promise<string | null> {
    if (!(await isDbAvailable())) {
      logger.warn(
        "[CareSync] DB unavailable — prescription not persisted",
        { requestId },
      );
      return null;
    }

    try {
      const prescription = await prisma.prescription.create({
        data: {
          userId,
          doctorName: doctorInfo?.name,
          doctorClinic: doctorInfo?.clinic,
          doctorRegNo: doctorInfo?.registration_no,
          prescriptionDate: doctorInfo?.date
            ? new Date(doctorInfo.date)
            : null,
          rawOcrText: rawText || null,
        },
      });

      if (medicines.length > 0) {
        await prisma.prescriptionItem.createMany({
          data: medicines.map((med) => ({
            prescriptionId: prescription.id,
            medicineName: med.name,
            genericName: med.generic_name,
            dosage: med.dosage,
            form: med.form,
            frequency: med.frequency,
            duration: med.duration,
            instructions: med.instructions,
          })),
        });
      }

      logger.info(
        `[CareSync] Prescription persisted: ${prescription.id}`,
        { requestId },
      );
      return prescription.id;
    } catch (error) {
      logger.warn("[CareSync] Failed to persist prescription", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function normalizeFrequency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  // Shorthand: "1+0+1" → "twice daily"
  if (/^\d(\+\d)+$/.test(lower)) {
    const total = lower.split("+").reduce((sum, p) => sum + parseInt(p, 10), 0);
    switch (total) {
      case 1: return "once daily";
      case 2: return "twice daily";
      case 3: return "three times daily";
      case 4: return "four times daily";
      default: return `${total} times daily`;
    }
  }

  // Latin abbreviations
  const abbrMap: Record<string, string> = {
    od: "once daily",
    bd: "twice daily",
    tds: "three times daily",
    qds: "four times daily",
    prn: "as needed",
    hs: "at bedtime",
  };
  if (abbrMap[lower]) return abbrMap[lower];

  return lower;
}

/** Build a result indicating the prescription could not be read. */
function buildUnreadableResult(): CareSyncResult {
  const summaryEn =
    "The handwritten prescription is unreadable. Please upload a clearer image.";
  const summaryUr =
    "نسخہ کا تحریر واضح نہیں ہے۔ براہ کرم صاف تصویر اپلوڈ کریں۔";

  return {
    medicines: [],
    doctor_info: null,
    reminders: [],
    raw_extracted_text: "",
    prescription_id: null,
    is_valid_medical_doc: false,
    has_high_risk_flag: false,
    summary_en: summaryEn,
    summary_ur: summaryUr,
    confidence: 0.3,
    audio_response: buildCareAudioResponse({
      medicines: [],
      doctor_info: null,
      prescription_id: null,
      summary_en: summaryEn,
      summary_ur: summaryUr,
    }),
  };
}

// ─── Types ──────────────────────────────────────────────────────────────

interface ParsedMedicine {
  name: string;
  generic_name: string | null;
  dosage: string | null;
  form: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  scheduled_times: string[];
  times_per_day: number;
}

interface DoctorInfo {
  name?: string;
  clinic?: string;
  date?: string;
  registration_no?: string;
}

interface ReminderSchedule {
  medicine_name: string;
  cron_expressions: string[];
  schedule_description: string;
  next_scheduled_times: string[];
}

/** Raw JSON shape from the Vision LLM response. */
interface VisionLLMResponse {
  is_valid_medical_doc?: boolean;
  is_readable?: boolean;
  medications?: Array<{
    name: string;
    generic_name?: string | null;
    dosage?: string | null;
    form?: string | null;
    frequency?: string | null;
    duration?: string | null;
    instructions?: string | null;
    scheduled_times?: string[];
    times_per_day?: number;
  }>;
  doctor_info?: DoctorInfo | null;
  schedules?: Array<{
    medicine_name: string;
    frequency: string;
    cron_expressions: string[];
    schedule_description: string;
  }>;
  has_high_risk_flag?: boolean;
  summary_en?: string;
  summary_ur?: string;
}

interface CareSyncResult {
  medicines: ParsedMedicine[];
  doctor_info: DoctorInfo | null;
  reminders: ReminderSchedule[];
  raw_extracted_text: string;
  prescription_id: string | null;
  is_valid_medical_doc?: boolean;
  has_high_risk_flag?: boolean;
  summary_en?: string;
  summary_ur?: string;
  confidence: number;
  audio_response?: AudioResponse;
}
