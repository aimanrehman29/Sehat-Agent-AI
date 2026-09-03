/**
 * ─────────────────────────────────────────────────────────────────────────────
 * lingoMed.ts — Lab report simplification with Vision AI (English + Urdu).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Lingo-Med AI takes complex medical lab reports (images or PDFs) and
 * produces plain-language explanations in BOTH English and Urdu that
 * patients can understand.
 *
 * Pipeline:
 *   1. Validate image presence
 *   2. Merge any voice transcript for extra context
 *   3. Send image to Vision AI model (Gemini / OpenAI) for:
 *      a. Image classification (medical vs non-medical)
 *      b. Structured extraction of test names, values, reference ranges
 *      c. Severity flagging (NORMAL | BORDERLINE | ABNORMAL | CRITICAL)
 *      d. Bilingual summaries (English + Urdu)
 *   4. If Vision unavailable → Tesseract OCR fallback pipeline
 *   5. Persist to LabReport + LabMetric Prisma models
 *
 * Guardrail:
 *   Every response MUST include the "Assist, not Diagnose" disclaimer.
 *   The response wrapper enforces this at the architecture level.
 */

import { prisma, isDbAvailable } from "@/lib/db";
import { extractText } from "@/lib/ocr/text-extractor";
import { logger } from "@/lib/logger";
import {
  transcribeVoicePayload,
  type VoicePayload,
} from "@/lib/voice/transcriber";
import { buildLingoAudioResponse, type AudioResponse } from "@/lib/voice/tts";
import {
  analyzeImageWithVision,
  parseVisionJson,
} from "@/lib/agents/visionClient";

// ─── Agent Class ────────────────────────────────────────────────────────

export class LingoMedAgent {
  readonly name = "lingo-med";

  async execute(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<LingoMedResult> {
    logger.info("[LingoMed] Starting report analysis", { requestId });

    const imageBase64 = payload.media_base64 as string | undefined;
    const mimeType = (payload.media_type as string) ?? "image/jpeg";
    const userId = (payload.user_id as string) ?? "anonymous";

    // ── Step 1: Merge voice transcript ──
    let voiceContext = "";
    const voicePayload = payload.voice_payload as VoicePayload | undefined;
    if (voicePayload) {
      const transcription = await transcribeVoicePayload(voicePayload, requestId);
      if (transcription.transcript) {
        voiceContext = transcription.transcript;
        logger.info(
          `[LingoMed] Voice transcript merged (${transcription.source})`,
          { requestId },
        );
      }
    }

    // ── Step 2: Vision AI — primary analysis path ──
    if (imageBase64) {
      const visionResult = await this.analyzeWithVision(
        imageBase64,
        mimeType,
        voiceContext,
        requestId,
      );

      // Non-medical image rejection
      if (visionResult && 'rejected' in visionResult) {
        return {
          patient_info: null,
          report_type: "N/A",
          key_findings: [],
          summary_en: visionResult.error_message_en,
          summary_ur: visionResult.error_message_ur,
          audio_text: visionResult.error_message_en,
          metrics: [],
          flagged_metrics: [],
          summary: visionResult.error_message_en,
          confidence: 0.95,
          audio_response: buildLingoAudioResponse({
            summary: visionResult.error_message_en,
            summary_en: visionResult.error_message_en,
            summary_ur: visionResult.error_message_ur,
            flagged_metrics: [],
            patient_info: null,
          }),
        };
      }

      if (visionResult && !('rejected' in visionResult)) {
        // Persist and return — Vision path succeeded
        await this.persistLabReport(
          userId,
          visionResult.report_type,
          visionResult.summary_en,
          visionResult.summary_ur,
          visionResult.audio_text,
          voiceContext,
          visionResult.key_findings,
          visionResult.metrics,
          visionResult.patient_info,
          requestId,
        );

        logger.info(
          `[LingoMed] Vision analysis complete — ${visionResult.flagged_metrics.length} flagged`,
          { requestId },
        );

        return {
          patient_info: visionResult.patient_info,
          report_type: visionResult.report_type,
          key_findings: visionResult.key_findings,
          summary_en: visionResult.summary_en,
          summary_ur: visionResult.summary_ur,
          audio_text: visionResult.audio_text,
          has_high_risk_flag: visionResult.has_high_risk_flag,
          metrics: visionResult.metrics,
          flagged_metrics: visionResult.flagged_metrics,
          // Legacy field for backward compat
          summary: visionResult.summary_en,
          confidence: 0.92,
          audio_response: buildLingoAudioResponse({
            summary: visionResult.summary_en,
            summary_en: visionResult.summary_en,
            summary_ur: visionResult.summary_ur,
            flagged_metrics: visionResult.flagged_metrics,
            patient_info: visionResult.patient_info,
          }),
        };
      }
    }

    // ── Step 3: Fallback path — Tesseract OCR + regex heuristics ──
    logger.info("[LingoMed] Using OCR fallback path", { requestId });
    return this.analyzeWithOCR(imageBase64, voiceContext, userId, requestId);
  }

  // ── Vision AI Analysis ──────────────────────────────────────────────

  private async analyzeWithVision(
    imageBase64: string,
    mimeType: string,
    voiceContext: string,
    requestId: string,
  ): Promise<VisionAnalysisOutput | NonMedicalRejection | null> {
    const userPrompt = voiceContext
      ? `Analyze this medical lab report image. Additional voice context from the patient: "${voiceContext}"`
      : "Analyze this medical lab report image. Extract all test results, classify severity, and provide bilingual summaries.";

    const visionResponse = await analyzeImageWithVision({
      imageBase64,
      mimeType,
      systemPrompt: LINGO_MED_SYSTEM_PROMPT,
      userPrompt,
      requestId,
      jsonResponse: true,
    });

    if (!visionResponse) {
      logger.warn("[LingoMed] Vision analysis unavailable", { requestId });
      return null;
    }

    const parsed = parseVisionJson<VisionLLMResponse>(visionResponse.text);
    if (!parsed) {
      logger.warn("[LingoMed] Vision response JSON parse failed", { requestId });
      return null;
    }

    // Non-medical image → reject immediately
    if (parsed.is_valid_medical_doc === false || parsed.is_medical === false) {
      logger.info("[LingoMed] Image classified as non-medical — rejected", {
        requestId,
      });
      return {
        rejected: true,
        error_message_en:
          "The uploaded image does not appear to be a medical report, prescription, or medicine package.",
        error_message_ur:
          "اپ لوڈ کی گئی تصویر طبی رپورٹ، نسخہ یا دوا کا پیکٹ نہیں لگتی۔",
      };
    }

    // Build metrics from LLM-extracted tests
    const metrics: LabMetric[] = (parsed.tests ?? []).map((t) => ({
      test_name: t.test_name,
      value: t.value,
      unit: t.unit,
      reference_low: t.reference_low ?? null,
      reference_high: t.reference_high ?? null,
      severity: (t.severity as MetricSeverity) ?? "NORMAL",
    }));

    const flagged = metrics.filter((m) => m.severity !== "NORMAL");
    const patientInfo = parsed.patient_info ?? null;

    return {
      patient_info: patientInfo,
      report_type: parsed.report_type ?? "Lab Report",
      key_findings: parsed.key_findings ?? [],
      summary_en: parsed.summary_en ?? "Lab report analyzed.",
      summary_ur: parsed.summary_ur ?? "لیب رپورٹ کا تجزیہ کیا گیا۔",
      audio_text: parsed.audio_text ?? parsed.summary_en ?? "Lab report analyzed.",
      has_high_risk_flag: parsed.has_high_risk_flag ?? false,
      metrics,
      flagged_metrics: flagged,
    };
  }

  // ── OCR Fallback Pipeline ─────────────────────────────────────────

  private async analyzeWithOCR(
    imageBase64: string | undefined,
    voiceContext: string,
    userId: string,
    requestId: string,
  ): Promise<LingoMedResult> {
    let rawText = "";

    if (imageBase64) {
      try {
        const buffer = Buffer.from(imageBase64, "base64");
        const textResult = await extractText(buffer, { language: "eng+urd" });
        rawText = textResult.raw_text;
        logger.debug(`[LingoMed] OCR extracted ${rawText.length} chars`, {
          requestId,
        });
      } catch (error) {
        logger.warn("[LingoMed] OCR extraction failed", {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (voiceContext) {
      rawText = rawText
        ? `${rawText}\n\n[Voice context]: ${voiceContext}`
        : voiceContext;
    }

    // Parse, classify, explain
    const metrics = this.parseMetricsFromText(rawText);
    const classified = metrics.map((m) => this.classifyMetric(m));
    const flagged = classified.filter((m) => m.severity !== "NORMAL");
    const explanations = flagged.map((m) => this.generateExplanation(m));
    const summaryEn = this.generateSummary(classified, flagged);
    const summaryUr = "لیب رپورٹ کا تجزیہ مکمل۔ براہ کرم اپنے ڈاکٹر سے مشورہ کریں۔";
    const patientInfo = this.extractPatientInfo(rawText);

    await this.persistLabReport(
      userId,
      "Lab Report",
      summaryEn,
      summaryUr,
      summaryEn,
      rawText,
      flagged.map((m) => ({
        test_name: m.test_name,
        severity: m.severity,
        explanation: explanations.find((e) => e.test_name === m.test_name)
          ?.explanation ?? "",
      })),
      classified,
      patientInfo,
      requestId,
    );

    logger.info(
      `[LingoMed] OCR fallback complete — ${flagged.length}/${classified.length} flagged`,
      { requestId },
    );

    return {
      patient_info: patientInfo,
      report_type: "Lab Report",
      key_findings: flagged.map((m) => ({
        test_name: m.test_name,
        severity: m.severity,
        explanation: explanations.find((e) => e.test_name === m.test_name)
          ?.explanation ?? "",
      })),
      summary_en: summaryEn,
      summary_ur: summaryUr,
      audio_text: summaryEn,
      has_high_risk_flag: classified.some((m) => m.severity === "CRITICAL"),
      metrics: classified,
      flagged_metrics: flagged,
      summary: summaryEn,
      confidence: 0.85,
      audio_response: buildLingoAudioResponse({
        summary: summaryEn,
        summary_en: summaryEn,
        summary_ur: summaryUr,
        flagged_metrics: flagged,
        patient_info: patientInfo,
      }),
    };
  }

  // ── OCR Metric Parsing (no hardcoded fallback) ────────────────────

  private parseMetricsFromText(rawText: string): RawMetric[] {
    if (!rawText || rawText.trim().length === 0) return [];

    const metrics: RawMetric[] = [];
    const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const parsed = this.parseLabLine(line);
      if (parsed) metrics.push(parsed);
    }

    return metrics; // May be empty — that's correct behavior
  }

  private parseLabLine(line: string): RawMetric | null {
    const pattern =
      /^([A-Za-z][A-Za-z\s()]+?)\s*[:\-]?\s*(\d+\.?\d*)\s*([A-Za-z/%]+)\s*(?:\(|\[)?\s*(\d+\.?\d*)?\s*[-–]\s*(\d+\.?\d*)?\s*(?:\)|\])?/;
    const match = line.match(pattern);
    if (!match) return null;

    const [, testName, valueStr, unit, refLowStr, refHighStr] = match;
    const value = parseFloat(valueStr);
    if (isNaN(value)) return null;

    return {
      test_name: testName.trim(),
      value,
      unit: unit.trim(),
      reference_low: refLowStr ? parseFloat(refLowStr) : null,
      reference_high: refHighStr ? parseFloat(refHighStr) : null,
    };
  }

  // ── Classification ────────────────────────────────────────────────

  private classifyMetric(m: RawMetric): LabMetric {
    let severity: MetricSeverity = "NORMAL";

    if (m.reference_low != null && m.value < m.reference_low) {
      severity = m.value < m.reference_low * 0.7 ? "CRITICAL" : "ABNORMAL";
    } else if (m.reference_high != null && m.value > m.reference_high) {
      severity =
        m.value > m.reference_high * 1.3 ? "CRITICAL" : "ABNORMAL";
    } else if (m.reference_high != null && m.value > m.reference_high * 0.9) {
      severity = "BORDERLINE";
    }

    return { ...m, severity };
  }

  // ── Explanation & Summary (OCR fallback) ──────────────────────────

  private generateExplanation(metric: LabMetric): MetricExplanation {
    let suggestion = "Please consult your doctor for this finding.";
    if (metric.severity === "CRITICAL") {
      suggestion =
        "This value is significantly outside the normal range. Please contact your doctor immediately.";
    } else if (metric.severity === "ABNORMAL") {
      suggestion =
        "This value is outside the normal range. Please consult your doctor.";
    }

    return {
      test_name: metric.test_name,
      explanation:
        `Your ${metric.test_name} is ${metric.value} ${metric.unit}. ` +
        `The normal range is ${metric.reference_low ?? "—"} – ${metric.reference_high ?? "—"} ${metric.unit}.`,
      severity: metric.severity,
      suggestion,
    };
  }

  private generateSummary(all: LabMetric[], flagged: LabMetric[]): string {
    if (all.length === 0) {
      return "Could not extract test results from the image. Please upload a clearer image of your lab report.";
    }
    if (flagged.length === 0) {
      return "All your lab results are within normal ranges. Great job maintaining your health!";
    }
    const flaggedNames = flagged.map((m) => m.test_name).join(", ");
    return (
      `${flagged.length} out of ${all.length} tests need attention: ${flaggedNames}. ` +
      `Please consult your doctor for these findings.`
    );
  }

  // ── Patient Info Extraction ───────────────────────────────────────

  private extractPatientInfo(rawText: string): PatientInfo | null {
    if (!rawText || rawText.trim().length === 0) return null;

    const headerLines = rawText
      .split("\n")
      .slice(0, 40)
      .map((l) => l.trim())
      .filter(Boolean);
    const headerBlock = headerLines.join("\n");

    // Name
    const namePatterns = [
      /patient\s+name\s*[:\-]\s*([A-Za-z][A-Za-z\s.]{1,50})/i,
      /name\s*[:\-]\s*([A-Za-z][A-Za-z\s.]{1,50})/i,
      /patient\s*[:\-]\s*([A-Za-z][A-Za-z\s.]{1,50})/i,
    ];
    let name: string | undefined;
    for (const re of namePatterns) {
      const m = headerBlock.match(re);
      if (m && m[1].trim().length > 1) {
        name = m[1].trim().replace(/\s+(age|sex|dob|date|mr|ms|mrs).*$/i, "");
        break;
      }
    }

    // Age
    const agePatterns = [
      /age\s*[:/\-]\s*(\d{1,3})\s*(?:years?|yrs?|y\b)?/i,
      /\b(\d{1,3})\s*(?:years?|yrs?)\b/i,
    ];
    let age: number | undefined;
    for (const re of agePatterns) {
      const m = headerBlock.match(re);
      if (m) {
        const parsed = parseInt(m[1], 10);
        if (parsed > 0 && parsed < 130) { age = parsed; break; }
      }
    }

    // Gender
    const genderPattern =
      /(?:sex|gender)\s*[:\-/]\s*(male|female|m\b|f\b)|(?:age\/sex\s*:\s*\d+\s*\/\s*(male|female|m\b|f\b))/i;
    let gender: string | undefined;
    const gm = headerBlock.match(genderPattern);
    if (gm) {
      const raw = (gm[1] ?? gm[2] ?? "").trim().toLowerCase();
      if (raw === "m") gender = "Male";
      else if (raw === "f") gender = "Female";
      else gender = raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    // Report date
    const datePatterns = [
      /(?:report\s+)?date\s*[:\-]\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /(?:report\s+)?date\s*[:\-]\s*(\d{1,2}[\/\-][A-Za-z]{3}[\/\-]\d{2,4})/i,
      /(\d{4}-\d{2}-\d{2})/,
    ];
    let report_date: string | undefined;
    for (const re of datePatterns) {
      const m = headerBlock.match(re);
      if (m) { report_date = m[1].trim(); break; }
    }

    // Lab name
    const labPattern =
      /(?:lab(?:oratory)?(?:\s+name)?)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\s,.-]{2,60})/i;
    let lab_name: string | undefined;
    const lm = headerBlock.match(labPattern);
    if (lm) lab_name = lm[1].trim().replace(/\s{2,}/g, " ");

    if (!name && age === undefined && !gender && !report_date && !lab_name) {
      return null;
    }

    return {
      ...(name && { name }),
      ...(age !== undefined && { age }),
      ...(gender && { gender }),
      ...(report_date && { report_date }),
      ...(lab_name && { lab_name }),
    };
  }

  // ── Database Persistence ──────────────────────────────────────────

  private async persistLabReport(
    userId: string,
    reportType: string,
    summaryEn: string,
    summaryUr: string,
    audioText: string,
    rawText: string,
    keyFindings: KeyFinding[],
    metrics: LabMetric[],
    patientInfo: PatientInfo | null,
    requestId: string,
  ): Promise<void> {
    if (!(await isDbAvailable())) {
      logger.warn(
        "[LingoMed] DB unavailable — lab report not persisted",
        { requestId },
      );
      return;
    }

    try {
      const report = await prisma.labReport.create({
        data: {
          userId,
          patientName: patientInfo?.name,
          patientAge: patientInfo?.age,
          patientGender: patientInfo?.gender,
          reportDate: patientInfo?.report_date
            ? new Date(patientInfo.report_date)
            : null,
          labName: patientInfo?.lab_name,
          summary: summaryEn,
          rawOcrText: rawText || null,
        },
      });

      if (metrics.length > 0) {
        await prisma.labMetric.createMany({
          data: metrics.map((m) => {
            const finding = keyFindings.find((f) => f.test_name === m.test_name);
            return {
              labReportId: report.id,
              testName: m.test_name,
              value: m.value,
              unit: m.unit,
              referenceLow: m.reference_low,
              referenceHigh: m.reference_high,
              severity: m.severity,
              explanation: finding?.explanation ?? "",
              suggestion: "Consult your doctor.",
            };
          }),
        });
      }

      logger.info(`[LingoMed] Lab report persisted: ${report.id}`, { requestId });
    } catch (error) {
      logger.warn("[LingoMed] Failed to persist lab report", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ─── System Prompt ──────────────────────────────────────────────────

const LINGO_MED_SYSTEM_PROMPT = `You are Lingo-Med AI, a medical lab report analysis assistant for the Sehat-Agent AI platform in Pakistan.

Your task is to analyze medical lab report images from Pakistani laboratories and provide:
1. Document validation (is this a valid medical lab report?)
2. Extraction of all visible test results with values and reference ranges
3. Severity classification for each test
4. Controlled substance / high-risk flag detection
5. Plain-language summaries in BOTH English and Urdu (Nastaliq script)

IMPORTANT RULES:
- If the image is NOT a valid medical lab report (e.g., school experiment, random photo, recipe, newspaper, selfie, prescription, or medicine packaging), set "is_valid_medical_doc" to false and stop.
- Always provide summaries in BOTH English and Urdu.
- Never invent or hallucinate test values — only report what is visible in the image.
- Classify severity as: NORMAL, BORDERLINE, ABNORMAL, or CRITICAL.
- Use common Pakistani lab test names (CBC, LFT, RFT, Lipid Profile, HbA1c, etc.).
- Set "has_high_risk_flag" to true if ANY test result shows critically dangerous values (e.g., extremely high potassium, critically low platelets, troponin elevation suggesting heart attack, or any value that could indicate a life-threatening condition).

You MUST respond with valid JSON in this exact structure:
{
  "is_valid_medical_doc": true,
  "report_type": "Complete Blood Count",
  "patient_info": { "name": "...", "age": 35, "gender": "Male", "report_date": "...", "lab_name": "..." },
  "tests": [
    {
      "test_name": "Hemoglobin",
      "value": 14.2,
      "unit": "g/dL",
      "reference_low": 13.0,
      "reference_high": 17.0,
      "severity": "NORMAL"
    }
  ],
  "key_findings": [
    { "test_name": "...", "severity": "ABNORMAL", "explanation": "..." }
  ],
  "has_high_risk_flag": false,
  "summary_en": "Plain English summary of findings for the patient.",
  "summary_ur": "اردو میں خلاصہ — مریض کے لیے آسان الفاظ میں۔",
  "audio_text": "Text to be read aloud — English first, then Urdu."
}

If the image is NOT a valid medical lab report:
{
  "is_valid_medical_doc": false,
  "summary_en": "The uploaded image does not appear to be a medical report, prescription, or medicine package.",
  "summary_ur": "اپ لوڈ کی گئی تصویر طبی رپورٹ، نسخہ یا دوا کا پیکٹ نہیں لگتی۔",
  "has_high_risk_flag": false
}`;

// ─── Types ──────────────────────────────────────────────────────────

type MetricSeverity = "NORMAL" | "BORDERLINE" | "ABNORMAL" | "CRITICAL";

interface RawMetric {
  test_name: string;
  value: number;
  unit: string;
  reference_low: number | null;
  reference_high: number | null;
}

interface LabMetric extends RawMetric {
  severity: MetricSeverity;
}

interface MetricExplanation {
  test_name: string;
  explanation: string;
  severity: MetricSeverity;
  suggestion: string;
}

interface KeyFinding {
  test_name: string;
  severity: string;
  explanation: string;
}

interface PatientInfo {
  name?: string;
  age?: number;
  gender?: string;
  report_date?: string;
  lab_name?: string;
}

/** Discriminated union for non-medical image rejection. */
interface NonMedicalRejection {
  rejected: true;
  error_message_en: string;
  error_message_ur: string;
}

/** Raw JSON shape from the Vision LLM response. */
interface VisionLLMResponse {
  is_medical?: boolean;
  is_valid_medical_doc?: boolean;
  report_type?: string;
  patient_info?: PatientInfo | null;
  tests?: Array<{
    test_name: string;
    value: number;
    unit: string;
    reference_low?: number | null;
    reference_high?: number | null;
    severity?: string;
  }>;
  key_findings?: KeyFinding[];
  summary_en?: string;
  summary_ur?: string;
  audio_text?: string;
  has_high_risk_flag?: boolean;
}

/** Internal output from the Vision analysis step. */
interface VisionAnalysisOutput {
  patient_info: PatientInfo | null;
  report_type: string;
  key_findings: KeyFinding[];
  summary_en: string;
  summary_ur: string;
  audio_text: string;
  has_high_risk_flag: boolean;
  metrics: LabMetric[];
  flagged_metrics: LabMetric[];
}

interface LingoMedResult {
  patient_info: PatientInfo | null;
  report_type?: string;
  key_findings?: KeyFinding[];
  summary_en?: string;
  summary_ur?: string;
  audio_text?: string;
  has_high_risk_flag?: boolean;
  metrics: LabMetric[];
  flagged_metrics: LabMetric[];
  summary: string;
  confidence: number;
  audio_response?: AudioResponse;
}
