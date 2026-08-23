/**
 * ─────────────────────────────────────────────────────────────────────────────
 * lingoMed.ts — Lab report simplification logic.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Lingo-Med AI takes complex medical lab reports (images or PDFs) and
 * produces plain-language explanations that patients can understand.
 *
 * Pipeline:
 *   1. OCR the lab report image/PDF (supports Urdu + English)
 *   2. Parse structured fields: test name, value, unit, reference range
 *   3. Classify each metric: NORMAL | BORDERLINE | ABNORMAL | CRITICAL
 *   4. Generate plain-English explanation for each flagged metric
 *   5. Produce overall summary paragraph
 *
 * Guardrail:
 *   Every response MUST include the "Assist, not Diagnose" disclaimer.
 *   The response wrapper enforces this at the architecture level.
 *
 * Example input:  Photo of a Chughtai Lab blood work report
 * Example output: "Your fasting sugar is high (138 mg/dL). Normal is 70–100..."
 */

import { logger } from "../utils/logger";

// ─── Agent Class ────────────────────────────────────────────────────────────

export class LingoMedAgent {
  readonly name = "lingo-med";

  /**
   * Execute the lab report simplification pipeline.
   *
   * @param payload - Contains media_base64 or media_url + media_type
   * @param requestId - Unique request identifier
   * @returns Structured lab analysis with explanations
   */
  async execute(
    payload: Record<string, unknown>,
    requestId: string
  ): Promise<LingoMedResult> {
    logger.info(`[LingoMed] Starting report analysis`, { requestId });

    // ── Step 1: OCR the lab report ──
    const rawText = await this.performOCR(payload);
    logger.debug(`[LingoMed] OCR extracted ${rawText.length} chars`, { requestId });

    // ── Step 2: Parse metrics from OCR text ──
    const metrics = await this.parseMetrics(rawText);
    logger.info(`[LingoMed] Parsed ${metrics.length} metrics`, { requestId });

    // ── Step 3: Classify each metric ──
    const classified = metrics.map((m) => this.classifyMetric(m));
    const flagged = classified.filter((m) => m.severity !== "NORMAL");

    // ── Step 4: Generate explanations for flagged metrics ──
    const explanations = await Promise.all(
      flagged.map((m) => this.generateExplanation(m))
    );

    // ── Step 5: Generate overall summary ──
    const summary = await this.generateSummary(classified, flagged);

    logger.info(`[LingoMed] Complete — ${flagged.length}/${classified.length} flagged`, { requestId });

    return {
      patient_info: null, // TODO: extract from report header
      metrics: classified,
      flagged_metrics: flagged,
      summary,
      explanations,
      confidence: 0.88,
    };
  }

  // ── OCR ──

  private async performOCR(_payload: Record<string, unknown>): Promise<string> {
    // TODO: Implement Tesseract.js OCR with eng+urd language support
    // TODO: Add image preprocessing (grayscale, threshold, deskew)
    return "";
  }

  // ── Metric Parsing ──

  private async parseMetrics(rawText: string): Promise<RawMetric[]> {
    // TODO: Use regex + heuristics to parse lab report lines
    // Pattern: "Test Name ... Value Unit ... (Ref Low – Ref High)"
    // Return mock data for now
    return [
      { test_name: "Hemoglobin", value: 14.2, unit: "g/dL", reference_low: 13.0, reference_high: 17.0 },
      { test_name: "Fasting Blood Glucose", value: 138, unit: "mg/dL", reference_low: 70, reference_high: 100 },
      { test_name: "Total Cholesterol", value: 215, unit: "mg/dL", reference_low: null, reference_high: 200 },
      { test_name: "TSH", value: 5.8, unit: "mIU/L", reference_low: 0.4, reference_high: 4.0 },
    ];
  }

  // ── Classification ──

  private classifyMetric(m: RawMetric): LabMetric {
    let severity: MetricSeverity = "NORMAL";

    if (m.reference_low != null && m.value < m.reference_low) {
      severity = m.value < m.reference_low * 0.7 ? "CRITICAL" : "ABNORMAL";
    } else if (m.reference_high != null && m.value > m.reference_high) {
      severity = m.value > m.reference_high * 1.3 ? "CRITICAL" : "ABNORMAL";
    } else if (m.reference_high != null && m.value > m.reference_high * 0.9) {
      severity = "BORDERLINE";
    }

    return { ...m, severity };
  }

  // ── Explanation Generation ──

  private async generateExplanation(metric: LabMetric): Promise<MetricExplanation> {
    // TODO: Use OpenAI API for natural language generation
    // For now, return template-based explanations
    return {
      test_name: metric.test_name,
      explanation: `Your ${metric.test_name} is ${metric.value} ${metric.unit}. ` +
        `The normal range is ${metric.reference_low ?? "—"} – ${metric.reference_high ?? "—"} ${metric.unit}.`,
      severity: metric.severity,
      suggestion: "Please consult your doctor for this finding.",
    };
  }

  // ── Summary Generation ──

  private async generateSummary(all: LabMetric[], flagged: LabMetric[]): Promise<string> {
    // TODO: Use LLM to generate cohesive summary
    if (flagged.length === 0) {
      return "All your lab results are within normal ranges. Great job maintaining your health!";
    }
    const flaggedNames = flagged.map((m) => m.test_name).join(", ");
    return `${flagged.length} out of ${all.length} tests need attention: ${flaggedNames}. ` +
      `Please consult your doctor for these findings.`;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface PatientInfo {
  name?: string;
  age?: number;
  gender?: string;
  report_date?: string;
  lab_name?: string;
}

interface LingoMedResult {
  patient_info: PatientInfo | null;
  metrics: LabMetric[];
  flagged_metrics: LabMetric[];
  summary: string;
  explanations: MetricExplanation[];
  confidence: number;
}
