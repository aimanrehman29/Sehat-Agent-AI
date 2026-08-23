/**
 * ─────────────────────────────────────────────────────────────────────────────
 * careSync.ts — Prescription reminder scheduling.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Care-Sync AI parses doctor prescriptions (parchi) from images and
 * generates structured medication data + cron-based reminder schedules.
 *
 * Pipeline:
 *   1. OCR the prescription image (handwriting-tolerant)
 *   2. Parse medicine names, dosages, frequencies, durations
 *   3. Extract doctor information (name, clinic, date)
 *   4. Generate cron expressions for each medicine schedule
 *   5. Store reminders in database for notification delivery
 *
 * Frequency Mapping:
 *   "once daily"      → 0 8 * * *
 *   "twice daily"     → 0 8 * * *, 0 20 * * *
 *   "three times"     → 0 8 * * *, 0 14 * * *, 0 20 * * *
 *   "before food"     → shift 30 min before meal cron
 *   "as needed"       → no cron, manual trigger
 *
 * The generated cron jobs are stored in the MedicationReminder table
 * and picked up by the notification scheduler.
 */

import { logger } from "../utils/logger";

// ─── Agent Class ────────────────────────────────────────────────────────────

export class CareSyncAgent {
  readonly name = "care-sync";

  /**
   * Execute the prescription parsing and reminder scheduling pipeline.
   *
   * @param payload - Contains media_base64 or media_url + media_type
   * @param requestId - Unique request identifier
   * @returns Parsed medicines + generated reminder schedules
   */
  async execute(
    payload: Record<string, unknown>,
    requestId: string
  ): Promise<CareSyncResult> {
    logger.info(`[CareSync] Starting prescription parse`, { requestId });

    // ── Step 1: OCR the prescription ──
    const rawText = await this.performOCR(payload);
    logger.debug(`[CareSync] OCR: ${rawText.length} chars`, { requestId });

    // ── Step 2: Parse medicines ──
    const medicines = await this.parseMedicines(rawText);
    logger.info(`[CareSync] Found ${medicines.length} medicines`, { requestId });

    // ── Step 3: Extract doctor info ──
    const doctorInfo = await this.extractDoctorInfo(rawText);

    // ── Step 4: Generate reminder schedules ──
    const reminders = medicines.map((med) => this.generateReminder(med));

    logger.info(`[CareSync] Complete — ${reminders.length} reminders created`, { requestId });

    return {
      medicines,
      doctor_info: doctorInfo,
      reminders,
      raw_extracted_text: rawText,
      confidence: 0.91,
    };
  }

  // ── OCR ──

  private async performOCR(_payload: Record<string, unknown>): Promise<string> {
    // TODO: Tesseract.js OCR with handwriting-tolerant preprocessing
    // TODO: Add Urdu script recognition for local prescriptions
    return "";
  }

  // ── Medicine Parsing ──

  private async parseMedicines(rawText: string): Promise<ParsedMedicine[]> {
    // TODO: Use LLM or regex to extract structured medicine data
    // Pattern: "MedicineName Dosage Form — Frequency x Duration (Instructions)"
    return [
      {
        name: "Augmentin 625mg",
        generic_name: "Amoxicillin + Clavulanic Acid",
        dosage: "625mg",
        form: "tablet",
        frequency: "twice daily",
        duration: "7 days",
        instructions: "take after food",
      },
      {
        name: "Risek 20mg",
        generic_name: "Omeprazole",
        dosage: "20mg",
        form: "capsule",
        frequency: "once daily",
        duration: "14 days",
        instructions: "take before breakfast",
      },
    ];
  }

  // ── Doctor Info Extraction ──

  private async extractDoctorInfo(_rawText: string): Promise<DoctorInfo | null> {
    // TODO: Extract from prescription header/footer
    return {
      name: "Dr. Fatima Hassan",
      clinic: "MediCare Clinic, Karachi",
      date: "2026-08-22",
      registration_no: "PMDC-45678",
    };
  }

  // ── Reminder Generation ──

  private generateReminder(medicine: ParsedMedicine): ReminderSchedule {
    const cronMap: Record<string, string[]> = {
      "once daily": ["0 8 * * *"],
      "twice daily": ["0 8 * * *", "0 20 * * *"],
      "three times daily": ["0 8 * * *", "0 14 * * *", "0 20 * * *"],
      "four times daily": ["0 7 * * *", "0 12 * * *", "0 17 * * *", "0 22 * * *"],
      "every other day": ["0 8 */2 * *"],
      "weekly": ["0 8 * * 1"],
      "as needed": [],
    };

    const freq = (medicine.frequency || "once daily").toLowerCase();
    const crons = cronMap[freq] || ["0 8 * * *"];

    // TODO: Persist to MedicationReminder table via Prisma
    return {
      medicine_name: medicine.name,
      cron_expressions: crons,
      schedule_description: this.describeSchedule(freq, medicine.duration),
      next_scheduled_times: [], // TODO: calculate from cron
    };
  }

  private describeSchedule(frequency: string, duration: string | null): string {
    const dur = duration ? ` for ${duration}` : "";
    return `${frequency}${dur}`;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedMedicine {
  name: string;
  generic_name: string | null;
  dosage: string | null;
  form: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
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

interface CareSyncResult {
  medicines: ParsedMedicine[];
  doctor_info: DoctorInfo | null;
  reminders: ReminderSchedule[];
  raw_extracted_text: string;
  confidence: number;
}
