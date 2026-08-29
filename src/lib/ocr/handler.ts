/**
 * OCR Handler — Tesseract.js worker initialization and execution.
 *
 * Provides a singleton Tesseract worker that is lazily initialized on first use.
 * Supports English and Urdu OCR for lab reports and prescriptions.
 *
 * Usage:
 *   import { performOCR, terminateOCR } from "@/lib/ocr/handler";
 *   const result = await performOCR(imageBuffer, "eng+urd");
 */

import Tesseract, { type Worker } from "tesseract.js";
import { createLogger } from "@/lib/logger";

const log = createLogger("ocr-handler");

// ─── Singleton Worker ─────────────────────────────────────────────────────

let workerInstance: Worker | null = null;
let initPromise: Promise<Worker> | null = null;
let currentLanguage: string = "eng";

/**
 * Lazily initialize the Tesseract worker.
 * Subsequent calls return the cached worker without reinitializing.
 */
async function getWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    log.info(`Initializing Tesseract OCR worker (lang=${currentLanguage})...`);
    const w = await Tesseract.createWorker(currentLanguage);
    workerInstance = w;
    log.info("Tesseract worker ready");
    return w;
  })();

  return initPromise;
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Perform OCR on an image buffer and return structured extraction results.
 *
 * @param imageBuffer - Raw image bytes (PNG, JPEG, WebP)
 * @param language - Tesseract language code (default "eng", use "eng+urd" for Urdu)
 * @returns Structured OCR result with text, confidence, and blocks
 */
export async function performOCR(
  imageBuffer: Buffer,
  language: string = "eng"
): Promise<OCRHandlerResult> {
  const startTime = Date.now();

  // Terminate and reinitialize if language changed
  if (workerInstance && currentLanguage !== language) {
    log.info(`Reloading worker: ${currentLanguage} → ${language}`);
    await workerInstance.terminate();
    workerInstance = null;
    initPromise = null;
    currentLanguage = language;
  }

  const worker = await getWorker();

  try {
    const { data } = await worker.recognize(imageBuffer);

    const blocks: OCRHandlerBlock[] = (data.blocks || []).map((b) => ({
      text: b.text,
      confidence: b.confidence,
      bbox: {
        x0: b.bbox.x0,
        y0: b.bbox.y0,
        x1: b.bbox.x1,
        y1: b.bbox.y1,
      },
    }));

    return {
      raw_text: data.text,
      confidence: data.confidence / 100,
      processing_time_ms: Date.now() - startTime,
      language,
      blocks,
    };
  } catch (error) {
    log.error("OCR recognition failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `OCR failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Terminate the Tesseract worker.
 * Call during application shutdown to free resources.
 */
export async function terminateOCR(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    initPromise = null;
    log.info("Tesseract worker terminated");
  }
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface OCRHandlerResult {
  raw_text: string;
  confidence: number;
  processing_time_ms: number;
  language: string;
  blocks: OCRHandlerBlock[];
}

export interface OCRHandlerBlock {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}
