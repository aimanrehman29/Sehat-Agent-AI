/**
 * Agent-specific internal types used within each agent module.
 * These are internal to Track A and NOT sent over the wire.
 */

// ─── OCR Types ──────────────────────────────────────────────────────────────

export interface OCRResult {
  /** Raw extracted text */
  raw_text: string;
  /** Confidence score (0–1) */
  confidence: number;
  /** Processing time in ms */
  processing_time_ms: number;
  /** Language used for OCR */
  language: string;
  /** Individual words/blocks with positions */
  blocks: OCRBlock[];
}

export interface OCRBlock {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ─── Barcode / QR Types ────────────────────────────────────────────────────

export interface BarcodeResult {
  /** Decoded barcode value */
  value: string;
  /** Barcode format (EAN-13, Code128, etc.) */
  format: string;
  /** Confidence (0–1) */
  confidence: number;
}

export interface QRCodeResult {
  /** Decoded QR data */
  data: string;
  /** QR version */
  version: number;
}

// ─── Image Processing Types ─────────────────────────────────────────────────

export interface ProcessedImage {
  /** Buffer of the processed image */
  buffer: Buffer;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** MIME type after processing */
  mime_type: string;
}

// ─── Pharma-Check Internal Types ────────────────────────────────────────────

export interface PharmaCheckInput {
  image_buffer: Buffer;
  image_mime_type: string;
  user_query?: string;
}

export interface DrugLookupResult {
  found: boolean;
  drug: {
    id: string;
    drug_name: string;
    registration_no: string;
    manufacturer: string;
    category: string;
    is_active: boolean;
    batch_numbers: string[];
    expiry_dates: string[];
  } | null;
}

// ─── Lingo-Med Internal Types ───────────────────────────────────────────────

export interface LingoMedInput {
  image_buffer: Buffer;
  image_mime_type: string;
  user_query?: string;
}

export interface RawLabLine {
  /** The raw line of text from OCR */
  raw: string;
  /** Parsed components (if successful) */
  test_name?: string;
  value?: string;
  unit?: string;
  reference_range?: string;
}

// ─── Care-Sync Internal Types ───────────────────────────────────────────────

export interface CareSyncInput {
  image_buffer: Buffer;
  image_mime_type: string;
  user_query?: string;
}

export interface RawPrescriptionLine {
  raw: string;
  medicine_name?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
}

// ─── Agent Execution Context ────────────────────────────────────────────────

/**
 * Context passed to each agent's execute function.
 * Contains request metadata without the full orchestrator envelope.
 */
export interface AgentExecutionContext {
  request_id: string;
  session_id: string;
  user_id?: string;
  started_at: number; // Date.now()
}
