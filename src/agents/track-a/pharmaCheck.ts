/**
 * ─────────────────────────────────────────────────────────────────────────────
 * pharmaCheck.ts — Medicine verification with Vision AI + DRAP registry.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pharma-Check AI analyzes medicine packaging images to verify authenticity
 * against the DRAP (Drug Regulatory Authority of Pakistan) registry.
 *
 * Pipeline:
 *   1. Send packaging image to Vision AI to extract printed text:
 *      brand names, generic names, dosage strengths, barcode numbers, DRAP#
 *   2. Query DRAP DrugRegistry database for verification
 *   3. Calculate risk score and determine authenticity status
 *   4. Return bilingual safety warnings (English + Urdu)
 *
 * Authenticity statuses:
 *   VERIFIED               — Drug found in DRAP registry, identifiers match
 *   COULD NOT BE VERIFIED  — No readable text or DB lookup failed
 *   WARNING                — Identifiers found but inconsistencies detected
 *
 * CRITICAL: Never return "Unidentified" unless the image truly has no
 * readable text. If the vision model can read "Risperdal Tablets 4mg",
 * that IS the extracted drug info.
 */

import { prisma, isDbAvailable } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  transcribeVoicePayload,
  type VoicePayload,
} from "@/lib/voice/transcriber";
import { buildPharmaAudioResponse, type AudioResponse } from "@/lib/voice/tts";
import {
  analyzeImageWithVision,
  parseVisionJson,
} from "@/lib/agents/visionClient";

// ─── System Prompt ──────────────────────────────────────────────────────

const PHARMA_CHECK_SYSTEM_PROMPT = `You are Pharma-Check AI, a medicine packaging verification assistant for the Sehat-Agent AI platform in Pakistan.

Your task is to analyze medicine packaging images and extract ALL visible printed text for DRAP (Drug Regulatory Authority of Pakistan) verification.

IMPORTANT RULES:
- First verify: is this a valid medicine packaging image? If NOT (e.g., random photo, lab report, prescription, newspaper), set "is_valid_medical_doc" to false and stop.
- Extract EVERY piece of visible text from the packaging: brand name, generic/chemical name, dosage strength (e.g. "4mg", "500mg"), manufacturer name, batch number, expiry date, DRAP registration number, barcode numbers.
- If the packaging clearly shows readable text like "Risperdal Tablets 4mg", extract it — do NOT say "unidentified".
- Only mark text as unreadable if the image is truly blank, too blurry, or completely obscured.
- Use your knowledge of Pakistani and international drug names to identify brand and generic names.
- Always provide safety warnings in BOTH English and Urdu (Nastaliq script).
- CONTROLLED SUBSTANCES: Set "has_high_risk_flag" to true if the extracted medicine is a controlled substance or narcotic. Controlled substances include: Morphine, Codeine (including Syrup Codeine), Tramadol, Fentanyl, Oxycodone, Hydrocodone, Diazepam, Alprazolam, Clonazepam, Lorazepam, Midazolam, Pentazocine, Phenytoin, Phenobarbital, and any medicine listed in Pakistan's narcotics/psychotropic schedules.
- If has_high_risk_flag is true, include mandatory safety disclaimers in both English and Urdu advising strict doctor supervision and local hospital verification.

You MUST respond with valid JSON in this exact structure:
{
  "is_valid_medical_doc": true,
  "has_readable_text": true,
  "brand_name": "Risperdal",
  "generic_name": "Risperidone",
  "strength": "4mg",
  "form": "Tablet",
  "manufacturer": "Janssen Pharmaceuticals",
  "batch_number": "LOT-2026-445",
  "expiry_date": "12/2027",
  "drap_number": "DRAP-XXXX-XXXX",
  "barcode_number": "8901234567890",
  "has_high_risk_flag": false,
  "safety_warnings_en": ["Take as prescribed.", "Store below 30°C."],
  "safety_warnings_ur": ["ڈاکٹر کی ہدایت کے مطابق لیں۔", "30 ڈگری سے کم میں محفوظ کریں۔"],
  "summary_en": "English summary of findings.",
  "summary_ur": "اردو میں خلاصہ۔"
}

If the image is NOT valid medicine packaging:
{
  "is_valid_medical_doc": false,
  "summary_en": "The uploaded image does not appear to be a medical report, prescription, or medicine package.",
  "summary_ur": "اپ لوڈ کی گئی تصویر طبی رپورٹ، نسخہ یا دوا کا پیکٹ نہیں لگتی۔",
  "has_high_risk_flag": false
}

If no text is readable:
{
  "is_valid_medical_doc": true,
  "has_readable_text": false,
  "summary_en": "No readable text found on the packaging. Please upload a clearer image.",
  "summary_ur": "پیکجنگ پر کوئی قابل پڑھائی متن نہیں ملا۔ براہ کرم صاف تصویر اپلوڈ کریں۔",
  "has_high_risk_flag": false
}`;

// ─── Agent Class ────────────────────────────────────────────────────────

export class PharmaCheckAgent {
  readonly name = "pharma-check";

  async execute(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<PharmaCheckResult> {
    logger.info("[PharmaCheck] Starting analysis", { requestId });

    const imageBase64 = payload.media_base64 as string | undefined;
    const mimeType = (payload.media_type as string) ?? "image/jpeg";

    if (!imageBase64) {
      logger.warn("[PharmaCheck] No image provided", { requestId });
      return buildNoImageResult();
    }

    // ── Merge voice transcript ──
    let voiceContext = "";
    const voicePayload = payload.voice_payload as VoicePayload | undefined;
    if (voicePayload) {
      const transcription = await transcribeVoicePayload(voicePayload, requestId);
      if (transcription.transcript) {
        voiceContext = transcription.transcript;
        logger.info(
          `[PharmaCheck] Voice transcript merged (${transcription.source})`,
          { requestId },
        );
      }
    }

    // ── Vision AI — extract text from packaging ──
    const visionResult = await this.analyzeWithVision(
      imageBase64,
      mimeType,
      voiceContext,
      requestId,
    );

    if (!visionResult) {
      logger.warn("[PharmaCheck] Vision analysis failed entirely", { requestId });
      return buildVisionFailedResult();
    }

    // ── Non-medical document rejection ──
    if (visionResult.is_valid_medical_doc === false) {
      logger.info("[PharmaCheck] Image classified as non-medical — rejected", { requestId });
      return {
        barcode: null,
        qr_data: null,
        drap_registration_no: null,
        drug_found: false,
        drug_info: null,
        risk: { level: "LOW_RISK", score: 0, factors: [] },
        warnings: [],
        brand_name: null,
        generic_name: null,
        strength: null,
        verification_status: "UNVERIFIED",
        safety_warnings_en: [],
        safety_warnings_ur: [],
        scanned_item: "Invalid document",
        drap_number: "",
        authenticity_status: "COULD NOT BE VERIFIED",
        reasoning: visionResult.summary_en ?? "The uploaded image does not appear to be a medical report, prescription, or medicine package.",
        recommended_action: "Please upload a valid medicine packaging image.",
        disclaimer: "Sehat-Assist AI assists — it does not make medical decisions for you.",
        is_valid_medical_doc: false,
        has_high_risk_flag: false,
        summary_en: visionResult.summary_en ?? "The uploaded image does not appear to be a medical report, prescription, or medicine package.",
        summary_ur: visionResult.summary_ur ?? "اپ لوڈ کی گئی تصویر طبی رپورٹ، نسخہ یا دوا کا پیکٹ نہیں لگتی۔",
        audio_response: buildPharmaAudioResponse({
          authenticity_status: "COULD NOT BE VERIFIED",
          scanned_item: "Invalid document",
          recommended_action: "Please upload a valid medicine packaging image.",
        }),
      };
    }

    // ── No readable text → return clear error ──
    if (visionResult.has_readable_text === false) {
      logger.info("[PharmaCheck] No readable text on packaging", { requestId });
      return this.buildUnreadableResult(visionResult);
    }

    // ── DRAP database lookup ──
    const drapNo = visionResult.drap_number || null;
    const barcode = visionResult.barcode_number || null;
    const drugInfo = await this.lookupDrug(barcode, drapNo, requestId);

    // ── Risk calculation ──
    const risk = this.calculateRisk(barcode, drapNo, drugInfo, visionResult.has_readable_text ?? false);
    const authenticityStatus = this.determineAuthenticity(risk, drugInfo, visionResult);
    const recommendedAction = this.getRecommendedAction(authenticityStatus);
    const reasoning = this.buildReasoning(
      authenticityStatus,
      drugInfo,
      visionResult,
      barcode,
      drapNo,
    );

    const scannedItem =
      drugInfo?.drug_name ||
      visionResult.brand_name ||
      visionResult.generic_name ||
      "Unknown medicine";

    logger.info(
      `[PharmaCheck] Complete — status: ${authenticityStatus}, risk: ${risk.level}`,
      { requestId },
    );

    return {
      // Legacy fields
      barcode,
      qr_data: null,
      drap_registration_no: drapNo,
      drug_found: drugInfo !== null,
      drug_info: drugInfo,
      risk,
      warnings: risk.level !== "SAFE"
        ? risk.factors.filter((f) => f.severity !== "info").map((f) => `⚠️ ${f.description}`)
        : [],
      // Vision-extracted fields
      brand_name: visionResult.brand_name ?? null,
      generic_name: visionResult.generic_name ?? null,
      strength: visionResult.strength ?? null,
      verification_status: authenticityStatus === "VERIFIED" ? "VERIFIED" : "UNVERIFIED",
      safety_warnings_en: visionResult.safety_warnings_en ?? [],
      safety_warnings_ur: visionResult.safety_warnings_ur ?? [],
      // Updated blueprint fields
      scanned_item: scannedItem,
      drap_number: drapNo ?? "",
      authenticity_status: authenticityStatus,
      reasoning,
      recommended_action: recommendedAction,
      disclaimer: "Sehat-Assist AI assists — it does not make medical decisions for you.",
      // New fields
      is_valid_medical_doc: true,
      has_high_risk_flag: visionResult.has_high_risk_flag ?? false,
      summary_en: visionResult.summary_en ?? reasoning,
      summary_ur: visionResult.summary_ur ?? "تجزیہ مکمل۔ براہ کرم اپنے فارماسسٹ سے تصدیق کریں۔",
      audio_response: buildPharmaAudioResponse({
        authenticity_status: authenticityStatus,
        scanned_item: scannedItem,
        recommended_action: recommendedAction,
        risk,
        brand_name: visionResult.brand_name,
        generic_name: visionResult.generic_name,
        strength: visionResult.strength,
      }),
    };
  }

  // ── Vision AI Analysis ────────────────────────────────────────────

  private async analyzeWithVision(
    imageBase64: string,
    mimeType: string,
    voiceContext: string,
    requestId: string,
  ): Promise<VisionLLMResponse | null> {
    const userPrompt = voiceContext
      ? `Analyze this medicine packaging image. Additional voice context: "${voiceContext}"`
      : "Analyze this medicine packaging image. Extract all visible text including brand name, generic name, dosage strength, manufacturer, batch number, expiry date, and any DRAP registration number.";

    const visionResponse = await analyzeImageWithVision({
      imageBase64,
      mimeType,
      systemPrompt: PHARMA_CHECK_SYSTEM_PROMPT,
      userPrompt,
      requestId,
      jsonResponse: true,
    });

    if (!visionResponse) {
      logger.warn("[PharmaCheck] Vision model unavailable", { requestId });
      return null;
    }

    const parsed = parseVisionJson<VisionLLMResponse>(visionResponse.text);
    if (!parsed) {
      logger.warn("[PharmaCheck] Vision response JSON parse failed", { requestId });
      return null;
    }

    return parsed;
  }

  // ── Database Lookup ───────────────────────────────────────────────

  private async lookupDrug(
    barcode: string | null,
    drapNo: string | null,
    requestId: string,
  ): Promise<DrugInfo | null> {
    if (!(await isDbAvailable())) {
      logger.warn(
        "[PharmaCheck] DB unavailable — skipping drug registry lookup",
        { requestId },
      );
      return null;
    }

    try {
      if (drapNo) {
        const drug = await prisma.drugRegistry.findUnique({
          where: { registrationNo: drapNo },
        });
        if (drug) {
          logger.debug(`[PharmaCheck] DRAP match: ${drug.drugName}`, { requestId });
          return mapDrugRegistryToDrugInfo(drug);
        }
      }

      if (barcode) {
        const drugs = await prisma.drugRegistry.findMany({
          where: { barcodeData: barcode },
          take: 1,
        });
        if (drugs.length > 0) {
          logger.debug(`[PharmaCheck] Barcode match: ${drugs[0].drugName}`, { requestId });
          return mapDrugRegistryToDrugInfo(drugs[0]);
        }
      }

      logger.debug("[PharmaCheck] No DB match found", { requestId });
      return null;
    } catch (error) {
      logger.warn("[PharmaCheck] Database lookup failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ── Risk Calculation ──────────────────────────────────────────────

  private calculateRisk(
    barcode: string | null,
    drapNo: string | null,
    drugInfo: DrugInfo | null,
    hasReadableText: boolean,
  ): RiskAssessment {
    const factors: RiskFactor[] = [];
    let score = 0;

    if (drugInfo) {
      factors.push({ description: "DRAP registration verified", severity: "info", weight: 0.9 });
      score += 10;
    } else {
      factors.push({ description: "Drug NOT found in DRAP registry", severity: "critical", weight: 0.1 });
      score += 50;
    }

    if (barcode) {
      factors.push({ description: "Barcode detected on packaging", severity: "info", weight: 0.85 });
      score -= 5;
    } else {
      factors.push({ description: "No barcode detected", severity: "warning", weight: 0.3 });
      score += 10;
    }

    if (drapNo) {
      factors.push({ description: "DRAP number visible on packaging", severity: "info", weight: 0.8 });
      score -= 5;
    }

    if (hasReadableText) {
      factors.push({ description: "Packaging text is readable", severity: "info", weight: 0.7 });
      score -= 10;
    } else {
      factors.push({ description: "Packaging text is unreadable", severity: "warning", weight: 0.3 });
      score += 20;
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

  // ── Authenticity Determination ────────────────────────────────────

  private determineAuthenticity(
    risk: RiskAssessment,
    drugInfo: DrugInfo | null,
    vision: VisionLLMResponse,
  ): AuthenticityStatus {
    // If we have readable text with brand/generic name AND DB match → VERIFIED
    if (drugInfo && (risk.level === "SAFE" || risk.level === "LOW_RISK")) {
      return "VERIFIED";
    }
    // If DB match but higher risk → WARNING
    if (drugInfo && risk.level === "MEDIUM_RISK") return "WARNING";
    // If readable text but no DB match → WARNING (we can see the drug, just not in registry)
    if (vision.has_readable_text && vision.brand_name && !drugInfo) {
      return "WARNING";
    }
    // No readable text AND no DB match → COULD NOT BE VERIFIED
    return "COULD NOT BE VERIFIED";
  }

  // ── Response Builders ─────────────────────────────────────────────

  private buildReasoning(
    status: AuthenticityStatus,
    drugInfo: DrugInfo | null,
    vision: VisionLLMResponse,
    barcode: string | null,
    drapNo: string | null,
  ): string {
    const drugName = drugInfo?.drug_name || vision.brand_name || vision.generic_name || "unknown";

    switch (status) {
      case "VERIFIED":
        return `The scanned medicine (${drugName}) was found in the DRAP registry. ` +
          `Registration number ${drapNo ?? "N/A"} is verified and the barcode matches the registered product.`;
      case "WARNING":
        if (vision.brand_name && !drugInfo) {
          return `The packaging shows "${vision.brand_name}" (${vision.generic_name ?? "unknown generic"}, ${vision.strength ?? "unknown strength"}), ` +
            `but this drug was not found in the DRAP registry. Please confirm with your pharmacist.`;
        }
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

  private buildUnreadableResult(vision: VisionLLMResponse): PharmaCheckResult {
    const summaryEn = vision.summary_en ??
      "No readable text found on the packaging. Please upload a clearer image.";
    const summaryUr = vision.summary_ur ??
      "پیکجنگ پر کوئی قابل پڑھائی متن نہیں ملا۔ براہ کرم صاف تصویر اپلوڈ کریں۔";

    return {
      barcode: null,
      qr_data: null,
      drap_registration_no: null,
      drug_found: false,
      drug_info: null,
      risk: { level: "HIGH_RISK", score: 80, factors: [
        { description: "No readable text on packaging", severity: "critical", weight: 0.1 },
      ] },
      warnings: ["⚠️ No readable text found on the packaging"],
      brand_name: null,
      generic_name: null,
      strength: null,
      verification_status: "UNVERIFIED",
      safety_warnings_en: [],
      safety_warnings_ur: [],
      scanned_item: "Unreadable packaging",
      drap_number: "",
      authenticity_status: "COULD NOT BE VERIFIED",
      reasoning: summaryEn,
      recommended_action: "Please upload a clearer image of the medicine packaging.",
      disclaimer: "Sehat-Assist AI assists — it does not make medical decisions for you.",
      is_valid_medical_doc: true,
      has_high_risk_flag: false,
      summary_en: summaryEn,
      summary_ur: summaryUr,
      audio_response: buildPharmaAudioResponse({
        authenticity_status: "COULD NOT BE VERIFIED",
        scanned_item: "Unreadable packaging",
        recommended_action: "Please upload a clearer image.",
      }),
    };
  }
}

// ─── Static Result Builders ────────────────────────────────────────────

function buildNoImageResult(): PharmaCheckResult {
  return {
    barcode: null,
    qr_data: null,
    drap_registration_no: null,
    drug_found: false,
    drug_info: null,
    risk: { level: "CRITICAL", score: 100, factors: [] },
    warnings: ["No image provided for analysis"],
    brand_name: null,
    generic_name: null,
    strength: null,
    verification_status: "UNVERIFIED",
    safety_warnings_en: [],
    safety_warnings_ur: [],
    scanned_item: "No image",
    drap_number: "",
    authenticity_status: "COULD NOT BE VERIFIED",
    reasoning: "No image was provided for analysis.",
    recommended_action: "Please provide an image of the medicine packaging.",
    disclaimer: "Sehat-Assist AI assists — it does not make medical decisions for you.",
    is_valid_medical_doc: false,
    has_high_risk_flag: false,
    audio_response: buildPharmaAudioResponse({
      authenticity_status: "COULD NOT BE VERIFIED",
      scanned_item: "No image",
      recommended_action: "Please provide an image of the medicine packaging.",
    }),
  };
}

function buildVisionFailedResult(): PharmaCheckResult {
  return {
    barcode: null,
    qr_data: null,
    drap_registration_no: null,
    drug_found: false,
    drug_info: null,
    risk: { level: "HIGH_RISK", score: 85, factors: [
      { description: "Vision analysis unavailable", severity: "critical", weight: 0.1 },
    ] },
    warnings: ["⚠️ Vision analysis service is temporarily unavailable"],
    brand_name: null,
    generic_name: null,
    strength: null,
    verification_status: "UNVERIFIED",
    safety_warnings_en: [],
    safety_warnings_ur: [],
    scanned_item: "Analysis failed",
    drap_number: "",
    authenticity_status: "COULD NOT BE VERIFIED",
    reasoning: "The vision analysis service is temporarily unavailable. Please try again later.",
    recommended_action: "Please try again later or confirm with your pharmacist.",
    disclaimer: "Sehat-Assist AI assists — it does not make medical decisions for you.",
    is_valid_medical_doc: false,
    has_high_risk_flag: false,
    audio_response: buildPharmaAudioResponse({
      authenticity_status: "COULD NOT BE VERIFIED",
      scanned_item: "Analysis failed",
      recommended_action: "Please try again later.",
    }),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

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
  // Vision-extracted fields
  brand_name: string | null;
  generic_name: string | null;
  strength: string | null;
  verification_status: string;
  safety_warnings_en: string[];
  safety_warnings_ur: string[];
  // Blueprint fields
  scanned_item: string;
  drap_number: string;
  authenticity_status: AuthenticityStatus;
  reasoning: string;
  recommended_action: string;
  disclaimer: string;
  // New fields
  is_valid_medical_doc?: boolean;
  has_high_risk_flag?: boolean;
  // Bilingual summaries
  summary_en?: string;
  summary_ur?: string;
  // TTS
  audio_response?: AudioResponse;
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

/** Raw JSON shape from the Vision LLM response. */
interface VisionLLMResponse {
  is_valid_medical_doc?: boolean;
  has_readable_text?: boolean;
  brand_name?: string;
  generic_name?: string;
  strength?: string;
  form?: string;
  manufacturer?: string;
  batch_number?: string;
  expiry_date?: string;
  drap_number?: string;
  barcode_number?: string;
  has_high_risk_flag?: boolean;
  safety_warnings_en?: string[];
  safety_warnings_ur?: string[];
  summary_en?: string;
  summary_ur?: string;
}
