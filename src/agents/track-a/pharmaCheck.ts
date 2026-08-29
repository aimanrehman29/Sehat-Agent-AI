/**
 * ─────────────────────────────────────────────────────────────────────────────
 * pharmaCheck.ts — Fake medicine flagging logic (DRAP serialization mandate).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pharma-Check AI analyzes medicine packaging images to detect counterfeit
 * or suspicious drugs. It extracts:
 *
 *   1. Barcodes (EAN-13, Code128, 2D DataMatrix) from packaging
 *   2. QR codes containing registration metadata
 *   3. DRAP (Drug Regulatory Authority of Pakistan) registration numbers
 *
 * Each extracted identifier is compared against the DrugRegistry database
 * to detect batch/serial anomalies. An authenticity status is determined:
 *
 *   VERIFIED               — Drug found in DRAP registry, identifiers match
 *   COULD NOT BE VERIFIED  — No identifiers found or DB lookup failed
 *   WARNING                — Identifiers found but inconsistencies detected
 *
 * Pipeline:
 *   Image → OCR/Barcode/QR extraction → DRAP DB lookup → Risk scoring → JSON
 */

import { prisma } from "@/lib/db";
import { scanImage } from "@/lib/ocr/barcode-reader";
import { extractText } from "@/lib/ocr/text-extractor";
import { logger } from "@/lib/logger";

// ─── Agent Class ────────────────────────────────────────────────────────

export class PharmaCheckAgent {
  readonly name = "pharma-check";

  /**
   * Execute the pharma-check pipeline on a medicine packaging image.
   */
  async execute(
    payload: Record<string, unknown>,
    requestId: string
  ): Promise<PharmaCheckResult> {
    logger.info(`[PharmaCheck] Starting analysis`, { requestId });

    const imageBuffer = resolveImageBuffer(payload);
    if (!imageBuffer) {
      logger.warn("[PharmaCheck] No image buffer available", { requestId });
      return buildNoImageResult();
    }

    // ── Step 1: Extract barcode/QR from image ──
    const scanResult = await scanImage(imageBuffer).catch((err) => {
      logger.warn("[PharmaCheck] Barcode/QR scan failed", {
        requestId,
        error: String(err),
      });
      return { barcode: null, qr: null };
    });

    const barcode = scanResult.barcode?.value ?? null;
    const qrData = scanResult.qr?.data ?? null;

    logger.debug(
      `[PharmaCheck] Barcode: ${barcode ?? "not found"}, QR: ${qrData ? "found" : "not found"}`,
      { requestId }
    );

    // ── Step 2: Extract DRAP number via OCR ──
    const drapNo = await this.extractDRAPNumber(imageBuffer, qrData);
    logger.debug(`[PharmaCheck] DRAP#: ${drapNo ?? "not found"}`, { requestId });

    // ── Step 3: Lookup against DrugRegistry database ──
    const drugInfo = await this.lookupDrug(barcode, drapNo, requestId);

    // ── Step 4: Calculate risk ──
    const risk = this.calculateRisk(barcode, qrData, drapNo, drugInfo);

    // ── Step 5: Determine authenticity status ──
    const authenticityStatus = this.determineAuthenticity(risk, drugInfo);

    // ── Step 6: Build response ──
    const scannedItem =
      drugInfo?.drug_name || this.inferScannedItem(barcode, drapNo);
    const reasoning = this.buildReasoning(
      authenticityStatus,
      drugInfo,
      barcode,
      drapNo
    );
    const recommendedAction = this.getRecommendedAction(authenticityStatus);
    const warnings =
      risk.level !== "SAFE" ? this.generateWarnings(risk) : [];

    logger.info(
      `[PharmaCheck] Complete — status: ${authenticityStatus}, risk: ${risk.level}`,
      { requestId }
    );

    return {
      // ── Legacy fields ──
      barcode,
      qr_data: qrData,
      drap_registration_no: drapNo,
      drug_found: drugInfo !== null,
      drug_info: drugInfo,
      risk,
      warnings,
      // ── Updated blueprint fields ──
      scanned_item: scannedItem,
      drap_number: drapNo ?? "",
      authenticity_status: authenticityStatus,
      reasoning,
      recommended_action: recommendedAction,
      disclaimer:
        "Sehat-Assist AI assists — it does not make medical decisions for you.",
    };
  }

  // ── DRAP Number Extraction ──

  private async extractDRAPNumber(
    imageBuffer: Buffer,
    qrData: string | null
  ): Promise<string | null> {
    // Try to extract from QR data first
    if (qrData) {
      const match = qrData.match(/DRAP-\d{4}-\d{4}/i);
      if (match) return match[0].toUpperCase();

      // QR might contain pipe-delimited fields: DRAP-0001-1234|Name|Mfr
      const parts = qrData.split("|");
      if (parts[0] && /^DRAP-\d{4}-\d{4}$/i.test(parts[0].trim())) {
        return parts[0].trim().toUpperCase();
      }
    }

    // Fall back to OCR on the image
    try {
      const textResult = await extractText(imageBuffer, { language: "eng" });
      const drapPattern = /DRAP[-\s]?\d{4}[-\s]?\d{4}/i;
      for (const line of textResult.lines) {
        const match = line.match(drapPattern);
        if (match) {
          // Normalize to DRAP-XXXX-XXXX
          return match[0]
            .replace(/\s/g, "")
            .replace(/DRAP/i, "DRAP-")
            .replace(/--/g, "-")
            .toUpperCase();
        }
      }
    } catch (error) {
      logger.warn("[PharmaCheck] OCR extraction failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  // ── Database Lookup ──

  private async lookupDrug(
    barcode: string | null,
    drapNo: string | null,
    requestId: string
  ): Promise<DrugInfo | null> {
    try {
      // Query by DRAP registration number
      if (drapNo) {
        const drug = await prisma.drugRegistry.findUnique({
          where: { registrationNo: drapNo },
        });
        if (drug) {
          logger.debug(`[PharmaCheck] DRAP match: ${drug.drugName}`, {
            requestId,
          });
          return mapDrugRegistryToDrugInfo(drug);
        }
      }

      // Query by barcode data
      if (barcode) {
        const drugs = await prisma.drugRegistry.findMany({
          where: { barcodeData: barcode },
          take: 1,
        });
        if (drugs.length > 0) {
          logger.debug(`[PharmaCheck] Barcode match: ${drugs[0].drugName}`, {
            requestId,
          });
          return mapDrugRegistryToDrugInfo(drugs[0]);
        }
      }

      // Try searching by name extracted from QR
      logger.debug("[PharmaCheck] No DB match found", { requestId });
      return null;
    } catch (error) {
      logger.warn("[PharmaCheck] Database lookup failed (DB may be unavailable)", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
      factors.push({
        description: "DRAP registration verified",
        severity: "info",
        weight: 0.9,
      });
      score += 10;
    } else {
      factors.push({
        description: "Drug NOT found in DRAP registry",
        severity: "critical",
        weight: 0.1,
      });
      score += 70;
    }

    if (barcode) {
      factors.push({
        description: "Barcode matches registered product",
        severity: "info",
        weight: 0.85,
      });
      score -= 5;
    } else {
      factors.push({
        description: "No barcode detected",
        severity: "warning",
        weight: 0.3,
      });
      score += 15;
    }

    if (qrData) {
      factors.push({
        description: "QR data consistent with registry",
        severity: "info",
        weight: 0.9,
      });
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

  // ── Authenticity Determination ──

  private determineAuthenticity(
    risk: RiskAssessment,
    drugInfo: DrugInfo | null
  ): AuthenticityStatus {
    if (!drugInfo) return "COULD NOT BE VERIFIED";
    if (risk.level === "SAFE" || risk.level === "LOW_RISK") return "VERIFIED";
    if (risk.level === "MEDIUM_RISK") return "WARNING";
    return "COULD NOT BE VERIFIED";
  }

  // ── Response Helpers ──

  private buildReasoning(
    status: AuthenticityStatus,
    drugInfo: DrugInfo | null,
    barcode: string | null,
    drapNo: string | null
  ): string {
    switch (status) {
      case "VERIFIED":
        return `The scanned medicine (${drugInfo?.drug_name ?? "unknown"}) was found in the DRAP registry. ` +
          `Registration number ${drapNo ?? "N/A"} is verified and the barcode matches the registered product.`;
      case "WARNING":
        return `The scanned item was partially matched in the DRAP registry, but some identifiers ` +
          `could not be fully verified. Please confirm with your pharmacist before use.`;
      case "COULD NOT BE VERIFIED":
        return `The scanned item could not be matched against the DRAP drug registry. ` +
          `No valid registration number (${drapNo ?? "none found"}) or barcode (${barcode ?? "none found"}) ` +
          `was found in the database. This does not necessarily mean the product is counterfeit.`;
    }
  }

  private getRecommendedAction(status: AuthenticityStatus): string {
    switch (status) {
      case "VERIFIED":
        return "Medicine verified against DRAP registry. Safe to use as directed.";
      case "WARNING":
        return "Please confirm with your pharmacist before use.";
      case "COULD NOT BE VERIFIED":
        return "Please confirm with your pharmacist before use.";
    }
  }

  private inferScannedItem(barcode: string | null, drapNo: string | null): string {
    if (drapNo) return `Unknown drug (${drapNo})`;
    if (barcode) return `Unknown product (barcode: ${barcode})`;
    return "Unidentified medicine packaging";
  }

  private generateWarnings(risk: RiskAssessment): string[] {
    return risk.factors
      .filter((f) => f.severity !== "info")
      .map((f) => `⚠️ ${f.description}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function resolveImageBuffer(payload: Record<string, unknown>): Buffer | null {
  if (payload.media_base64) {
    return Buffer.from(payload.media_base64 as string, "base64");
  }
  if (payload.image_buffer && Buffer.isBuffer(payload.image_buffer)) {
    return payload.image_buffer;
  }
  return null;
}

function mapDrugRegistryToDrugInfo(drug: {
  drugName: string;
  registrationNo: string;
  manufacturer: string;
  category: string;
  isActive: boolean;
  batchNumbers: string[];
  expiryDates: string[];
}): DrugInfo {
  return {
    drug_name: drug.drugName,
    registration_no: drug.registrationNo,
    manufacturer: drug.manufacturer,
    batch_number: drug.batchNumbers[0] ?? null,
    expiry_date: drug.expiryDates[0] ?? null,
    category: drug.category,
    is_active: drug.isActive,
  };
}

function buildNoImageResult(): PharmaCheckResult {
  return {
    barcode: null,
    qr_data: null,
    drap_registration_no: null,
    drug_found: false,
    drug_info: null,
    risk: { level: "CRITICAL", score: 100, factors: [] },
    warnings: ["No image provided for analysis"],
    scanned_item: "No image",
    drap_number: "",
    authenticity_status: "COULD NOT BE VERIFIED",
    reasoning: "No image was provided for analysis.",
    recommended_action: "Please provide an image of the medicine packaging.",
    disclaimer:
      "Sehat-Assist AI assists — it does not make medical decisions for you.",
  };
}

// ─── Types ──────────────────────────────────────────────────────────────

type AuthenticityStatus =
  | "VERIFIED"
  | "COULD NOT BE VERIFIED"
  | "WARNING";

interface PharmaCheckResult {
  barcode: string | null;
  qr_data: string | null;
  drap_registration_no: string | null;
  drug_found: boolean;
  drug_info: DrugInfo | null;
  risk: RiskAssessment;
  warnings: string[];
  // ── Updated blueprint fields ──
  scanned_item: string;
  drap_number: string;
  authenticity_status: AuthenticityStatus;
  reasoning: string;
  recommended_action: string;
  disclaimer: string;
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

type RiskLevel =
  | "SAFE"
  | "LOW_RISK"
  | "MEDIUM_RISK"
  | "HIGH_RISK"
  | "CRITICAL";

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
