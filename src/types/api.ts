/**
 * API-level types used in Next.js route handlers.
 */

import type { NextRequest } from "next/server";

// ─── Route Handler Types ────────────────────────────────────────────────────

export interface RouteParams {
  params: Record<string, string>;
}

/**
 * Expected JSON body for POST /api/track-a/* endpoints.
 */
export interface TrackARequestBody {
  /** Base64-encoded image/PDF data */
  media_base64?: string;
  /** URL to the media file */
  media_url?: string;
  /** MIME type */
  media_type: string;
  /** Optional user query / context */
  query?: string;
  /** User identifier */
  user_id?: string;
  /** Session identifier for multi-turn */
  session_id?: string;
}

// ─── File Upload Types ──────────────────────────────────────────────────────

export interface UploadedFile {
  buffer: Buffer;
  mime_type: string;
  size_bytes: number;
  filename?: string;
}

// ─── API Error Types ────────────────────────────────────────────────────────

export interface APIError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Standard error codes used across all Track A endpoints.
 */
export const ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  MISSING_MEDIA: "MISSING_MEDIA",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  MEDIA_TOO_LARGE: "MEDIA_TOO_LARGE",
  OCR_FAILED: "OCR_FAILED",
  AGENT_ERROR: "AGENT_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
