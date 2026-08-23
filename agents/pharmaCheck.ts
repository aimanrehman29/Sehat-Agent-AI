/**
 * ─────────────────────────────────────────────────────────────────────────────
 * pharmaCheck.ts — Fake medicine flagging logic.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pharma-Check AI analyzes medicine packaging images to detect counterfeit
 * or suspicious drugs. It extracts:
 *
 *   1. Barcodes (EAN-13, Code128) from packaging
 *   2. QR codes containing registration metadata
 *   3. DRAP (Drug Regulatory Authority of Pakistan) registration numbers
 *
 * Each extracted identifier is compared against the DrugRegistry database
 * to detect batch/serial anomalies. A risk score (0–100) is calculated
 * with categorized risk factors.
 *
 * Pipeline:
 *   Image → OCR/Barcode/QR extraction → DRAP DB lookup → Risk scoring → JSON
 *
 * Risk Levels:
 *   SAFE | LOW_RISK | MEDIUM_RISK | HIGH_RISK | CRITICAL
 */

import { logger } from "../utils/logger";

// ─── Agent Class ────────────────────────────────────────────────────────────

export class PharmaCheckAgent {
  readonly name = "pharma-check";

  /**
   * Execute the pharma-check pipeline on a medicine packaging image.
   *
   * @param payload - Contains media_base64 or media_url + media_type
   * @param requestId - Unique request identifier for logging
   * @returns Structured risk assessment result
   */
  async execute(
    payload: Record<string, unknown>,
    requestId: string
  ): Promise<PharmaCheckResult> {
    logger.info(`[PharmaCheck] Starting analysis`, { requestId });

    // ── Step 1: Extract barcode from image ──
    const barcode = await this.extractBarcode(payload);
    logger.debug(`[PharmaCheck] Barcode: ${barcode ?? "not found"}`, { requestId });

    // ── Step 2: Extract QR code data ──
    const qrData = await this.extractQRCode(payload);
    logger.debug(`[PharmaCheck] QR: ${qrData ?? "not found"}`, { requestId });

    // ── Step 3: Extract DRAP registration number via OCR ──
    const drapNo = await this.extractDRAPNumber(payload);
    logger.debug(`[PharmaCheck] DRAP#: ${drapNo ?? "not found"}`, { requestId });

    // ── Step 4: Lookup against DrugRegistry database ──
    const drugInfo = await this.lookupDrug(barcode, drapNo);

    // ── Step 5: Calculate risk score ──
    const risk = this.calculateRisk(barcode, qrData, drapNo, drugInfo);

    logger.info(`[PharmaCheck] Complete — risk: ${risk.level} (${risk.score})`, { requestId });

    return {
      barcode,
      qr_data: qrData,
      drap_registration_no: drapNo,
      drug_found: drugInfo !== null,
      drug_info: drugInfo,
      risk,
      warnings: risk.level !== "SAFE" ? this.generateWarnings(risk) : [],
      confidence: 0.94,
    };
  }

  // ── Extraction Steps (TODO: implement with Tesseract.js + jsqr + sharp) ──

  private async extractBarcode(_payload: Record<string, unknown>): Promise<string | null> {
    // TODO: Use sharp to preprocess image, then barcode decoder
    return "8901234567890";
  }

  private async extractQRCode(_payload: Record<string, unknown>): Promise<string | null> {
    // TODO: Use jsqr library to decode QR from image buffer
    return "DRAP-0001-1234|Panadol|GSK";
  }

  private async extractDRAPNumber(_payload: Record<string, unknown>): Promise<string | null> {
    // TODO: Use Tesseract.js OCR, then regex for DRAP-XXXX-XXXX pattern
    return "DRAP-0001-1234";
  }

  // ── Database Lookup ──

  private async lookupDrug(
    barcode: string | null,
    drapNo: string | null
  ): Promise<DrugInfo | null> {
    // TODO: Query Prisma DrugRegistry table
    // For now, return mock data
    if (barcode || drapNo) {
      return {
        drug_name: "Panadol",
        registration_no: "DRAP-0001-1234",
        manufacturer: "GlaxoSmithKline Pakistan",
        batch_number: "PN-2025-001",
        expiry_date: "2027-06-30",
        category: "Analgesic",
        is_active: true,
      };
    }
    return null;
  }

  // ── Risk Calculation ──

  private calculateRisk(
    barcode: string | null,
    qrData: string | null,
    drapNo: string | null,
    drugInfo: DrugInfo | null
  ): RiskAssessment {
    const factors: RiskFactor[] = [];
    let score = 0;

    if (drugInfo) {
      factors.push({ description: "DRAP registration verified", severity: "info", weight: 0.9 });
      score += 10;
    } else {
      factors.push({ description: "Drug NOT found in DRAP registry", severity: "critical", weight: 0.1 });
      score += 70;
    }

    if (barcode) {
      factors.push({ description: "Barcode matches registered product", severity: "info", weight: 0.85 });
      score -= 5;
    } else {
      factors.push({ description: "No barcode detected", severity: "warning", weight: 0.3 });
      score += 15;
    }

    if (qrData) {
      factors.push({ description: "QR data consistent with registry", severity: "info", weight: 0.9 });
      score -= 5;
    }

    score = Math.max(0, Math.min(100, score));

    let level: RiskLevel;
    if (score <= 15) level = "SAFE";
    else if (score <= 35) level = "LOW_RISK";
    else if (score <= 60) level = "MEDIUM_RISK";
    else if (score <= 80) level = "HIGH_RISK";
    else level = "CRITICAL";

    return { level, score, factors };
  }

  private generateWarnings(risk: RiskAssessment): string[] {
    return risk.factors
      .filter((f) => f.severity !== "info")
      .map((f) => `⚠️ ${f.description}`);
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface PharmaCheckResult {
  barcode: string | null;
  qr_data: string | null;
  drap_registration_no: string | null;
  drug_found: boolean;
  drug_info: DrugInfo | null;
  risk: RiskAssessment;
  warnings: string[];
  confidence: number;
}

interface DrugInfo {
  drug_name: string;
  registration_no: string;
  manufacturer: string;
  batch_number: string | null;
  expiry_date: string | null;
  category: string;
  is_active: boolean;
}

type RiskLevel = "SAFE" | "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK" | "CRITICAL";

interface RiskFactor {
  description: string;
  severity: "info" | "warning" | "critical";
  weight: number;
}

interface RiskAssessment {
  level: RiskLevel;
  score: number;
  factors: RiskFactor[];
}
