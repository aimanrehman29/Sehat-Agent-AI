/**
 * Text Extractor — General OCR text extraction for lab reports and prescriptions.
 *
 * Wraps the Tesseract OCR handler with additional image preprocessing via Sharp
 * for improved accuracy on medical documents (lab reports, prescriptions).
 *
 * Supports both English and Urdu text extraction.\n *
 * Usage:
 *   import { extractText } from "@/lib/ocr/text-extractor";
 *   const result = await extractText(imageBuffer, { language: "eng+urd" });
 */

import sharp from "sharp";
import { performOCR } from "./handler";
import { createLogger } from "@/lib/logger";

const log = createLogger("text-extractor");

// ─── Configuration ──────────────────────────────────────────────────────

export interface TextExtractorOptions {
  /** Tesseract language code (default "eng", use "eng+urd" for Urdu) */
  language?: string;
  /** Whether to preprocess image for better accuracy (default true) */
  preprocess?: boolean;
  /** Resize image if width exceeds this (default 3000px) */
  max_width?: number;
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Extract text from an image buffer with optional preprocessing.
 *
 * Applies grayscale conversion, contrast normalization, and adaptive thresholding
 * before running OCR. This significantly improves accuracy on:
 * - Low-contrast lab report printouts
 * - Handwritten prescriptions (parchi)
 * - Photographed documents with shadows or uneven lighting
 */
export async function extractText(
  imageBuffer: Buffer,
  options: TextExtractorOptions = {}
): Promise<TextExtractResult> {
  const {
    language = "eng",
    preprocess = true,
    max_width = 3000,
  } = options;

  const startTime = Date.now();
  let processedBuffer = imageBuffer;

  if (preprocess) {
    processedBuffer = await preprocessImage(imageBuffer, max_width);
    log.debug("Image preprocessed for text extraction");
  }

  const ocrResult = await performOCR(processedBuffer, language);

  const lines = parseLines(ocrResult.raw_text);

  return {
    raw_text: ocrResult.raw_text,
    lines,
    confidence: ocrResult.confidence,
    processing_time_ms: Date.now() - startTime,
    language,
    blocks: ocrResult.blocks,
  };
}

// ─── Image Preprocessing ────────────────────────────────────────────────

/**
 * Preprocess an image for improved OCR accuracy on medical documents.
 * Applies grayscale, contrast normalization, thresholding, and resizing.
 */
async function preprocessImage(
  imageBuffer: Buffer,
  maxWidth: number
): Promise<Buffer> {
  try {
    let pipeline = sharp(imageBuffer);

    // Resize if too large (prevents OOM and speeds up OCR)
    const metadata = await sharp(imageBuffer).metadata();
    if ((metadata.width ?? 0) > maxWidth) {
      pipeline = pipeline.resize(maxWidth);
    }

    const processed = await pipeline
      .greyscale()
      .normalize() // stretch contrast
      .threshold(140) // binarize for cleaner text edges
      .png()
      .toBuffer();

    return processed;
  } catch (error) {
    log.warn("Image preprocessing failed, using original", {
      error: error instanceof Error ? error.message : String(error),
    });
    return imageBuffer;
  }
}

// ─── Line Parsing ───────────────────────────────────────────────────────

/**
 * Split raw OCR text into non-empty trimmed lines.
 */
function parseLines(rawText: string): string[] {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface TextExtractResult {
  raw_text: string;
  lines: string[];
  confidence: number;
  processing_time_ms: number;
  language: string;
  blocks: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
}
