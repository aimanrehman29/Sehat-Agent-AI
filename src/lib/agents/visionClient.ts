/**
 * ─────────────────────────────────────────────────────────────────────────────
 * visionClient.ts — Shared vision-LLM client for Track A agents.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Sends an image + text prompt to a vision-capable model and returns the
 * text response.  Used by Lingo-Med, Care-Sync, and Pharma-Check to perform
 * image understanding that goes far beyond what Tesseract OCR alone can
 * extract (handwritten prescriptions, medical lab report tables, medicine
 * packaging text, etc.).
 *
 * Provider chain (mirrors agent-chat-handler.ts & transcriber.ts):
 *   Gemini (GEMINI_2_KEY) → OpenAI (OPENAI_API_KEY) → null
 *
 * The image is passed as base64 `inlineData` (Gemini) or `image_url`
 * (OpenAI gpt-4o) — never dropped before the model call.
 */

import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { logger } from "@/lib/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VisionAnalysisRequest {
  /** Base64-encoded image data (no "data:" prefix). */
  imageBase64: string;
  /** Image MIME type (e.g. "image/jpeg", "image/png"). */
  mimeType: string;
  /** System instruction for the vision model. */
  systemPrompt: string;
  /** User prompt sent alongside the image. */
  userPrompt: string;
  /** Unique request ID for structured logging. */
  requestId: string;
  /**
   * When true, forces responseMimeType "application/json" on Gemini
   * and adds "Respond in JSON" hint on OpenAI.
   */
  jsonResponse?: boolean;
  /** Optional Gemini responseSchema for strict JSON enforcement. */
  responseSchema?: Record<string, unknown>;
}

export interface VisionAnalysisResult {
  /** Raw text response from the model. */
  text: string;
  /** Which provider generated the response. */
  source: "gemini" | "openai";
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GEMINI_VISION_MODEL = "gemini-3.6-flash";

// ─── Lazy Gemini Client ─────────────────────────────────────────────────────

let _gemini: GoogleGenAI | null | undefined;

function getGeminiClient(): GoogleGenAI | null {
  if (_gemini !== undefined) return _gemini;

  // Resolve Gemini API key from multiple possible env vars.
  // GEMINI_2_KEY is the canonical name for Track A; the others are common aliases.
  const apiKey =
    process.env.GEMINI_2_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    logger.error(
      "[VisionClient] CRITICAL: No Gemini API key found in process.env. " +
        "Checked: GEMINI_2_KEY, GEMINI_API_KEY, NEXT_PUBLIC_GEMINI_API_KEY, GOOGLE_API_KEY. " +
        "Set GEMINI_2_KEY in your .env file.",
    );
    _gemini = null;
  } else {
    logger.info(
      `[VisionClient] Gemini client initialized (key source: ${
        process.env.GEMINI_2_KEY ? "GEMINI_2_KEY" :
        process.env.GEMINI_API_KEY ? "GEMINI_API_KEY" :
        process.env.NEXT_PUBLIC_GEMINI_API_KEY ? "NEXT_PUBLIC_GEMINI_API_KEY" :
        "GOOGLE_API_KEY"
      }, model: ${GEMINI_VISION_MODEL})`,
    );
    _gemini = new GoogleGenAI({ apiKey });
  }

  return _gemini;
}

// ─── Lazy OpenAI Client (fallback) ──────────────────────────────────────────

let _openai: OpenAI | null | undefined;

function getOpenAIClient(): OpenAI | null {
  if (_openai !== undefined) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  _openai = apiKey ? new OpenAI({ apiKey }) : null;
  return _openai;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Send an image to a vision-capable LLM and return the text response.
 *
 * Tries Gemini first (supports inlineData for images + JSON mode).
 * Falls back to OpenAI gpt-4o if Gemini is unavailable or fails.
 * Returns null only when neither provider is configured or both fail.
 */
export async function analyzeImageWithVision(
  request: VisionAnalysisRequest,
): Promise<VisionAnalysisResult | null> {
  const {
    imageBase64,
    mimeType,
    systemPrompt,
    userPrompt,
    requestId,
    jsonResponse = false,
    responseSchema,
  } = request;

  // ── Gemini path (preferred) ──
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const config: Record<string, unknown> = {
        systemInstruction: systemPrompt,
        temperature: 0.2,
        maxOutputTokens: 4096,
      };

      if (jsonResponse) {
        config.responseMimeType = "application/json";
        if (responseSchema) {
          config.responseSchema = responseSchema;
        }
      }

      const completion = await gemini.models.generateContent({
        model: GEMINI_VISION_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: userPrompt },
              { inlineData: { data: imageBase64, mimeType } },
            ],
          },
        ],
        config,
      });

      const text = completion.text?.trim() ?? "";
      if (text) {
        logger.info("[VisionClient] Gemini vision analysis complete", {
          requestId,
          chars: text.length,
        });
        return { text, source: "gemini" };
      }

      logger.warn("[VisionClient] Empty Gemini vision response — trying OpenAI", {
        requestId,
      });
    } catch (error) {
      logger.warn("[VisionClient] Gemini vision failed — trying OpenAI", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    logger.debug("[VisionClient] GEMINI_2_KEY not set — trying OpenAI", {
      requestId,
    });
  }

  // ── OpenAI fallback path ──
  const openai = getOpenAIClient();
  if (openai) {
    try {
      const fullPrompt = jsonResponse
        ? `${systemPrompt}\n\n${userPrompt}\n\nRespond with valid JSON only.`
        : `${systemPrompt}\n\n${userPrompt}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: fullPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      });

      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      if (text) {
        logger.info("[VisionClient] OpenAI vision analysis complete", {
          requestId,
          chars: text.length,
        });
        return { text, source: "openai" };
      }
    } catch (error) {
      logger.warn("[VisionClient] OpenAI vision failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return null;
}

// ─── JSON Helpers ────────────────────────────────────────────────────────────

/**
 * Safely parse a JSON string from a vision model response.
 * Handles markdown code fences and leading/trailing whitespace.
 */
export function parseVisionJson<T = Record<string, unknown>>(
  raw: string,
): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Strip markdown code fences: ```json ... ``` or ``` ... ```
    const stripped = raw
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    try {
      return JSON.parse(stripped) as T;
    } catch {
      // Last resort: extract first JSON object or array
      const objMatch = raw.match(/\{[\s\S]*\}/);
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      const candidate = objMatch?.[0] ?? arrMatch?.[0];
      if (candidate) {
        try {
          return JSON.parse(candidate) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

// Re-export Type for callers that want to build responseSchema objects
export { Type };
