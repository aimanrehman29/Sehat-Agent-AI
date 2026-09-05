/**
 * ─────────────────────────────────────────────────────────────────────────────
 * voiceUnderstanding.ts — Server-side audio understanding via Gemini.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Replaces the browser's Web Speech API (unreliable for Urdu, inconsistent
 * across phones) for the Orchestrator's voice input path: the actual
 * recorded audio is sent to Gemini — same GEMINI_API_KEY and same model
 * already proven working elsewhere (gemini-3.6-flash) — for real
 * transcription AND translation to English. That clean English text then
 * flows through the existing intent pipeline unchanged.
 *
 * Uses the same null-safe lazy client getter + graceful non-throwing
 * fallback pattern as doctorLookup.ts and fallbackAssistant.ts.
 */

import { GoogleGenAI } from "@google/genai";
import { logger } from "@/lib/logger";

// ─── Result Interface ───────────────────────────────────────────────────────

export interface VoiceUnderstandingResult {
  /** English translation of what was said ("" on failure). */
  transcript: string;
  /** False when the key is missing or the Gemini call failed. */
  success: boolean;
}

// ─── Gemini Client (lazy singleton) ─────────────────────────────────────────

const AUDIO_MODEL = "gemini-3.6-flash";

let _gemini: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (_gemini) return _gemini;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _gemini = new GoogleGenAI({ apiKey });
  return _gemini;
}

// ─── Audio Prompt ───────────────────────────────────────────────────────────

const AUDIO_PROMPT =
  "Listen to this audio clip of a Pakistani patient speaking to a healthcare app. " +
  "They may speak in English, Urdu, Roman Urdu, or a mix. " +
  "Transcribe what they said and translate it into clear English. " +
  "Reply with ONLY the English translation of what was said — no preamble, no quotes, " +
  "no explanation, just the translated sentence(s) as they would type it themselves.";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Sends recorded audio directly to Gemini for transcription + translation
 * to English. Returns success: false (never throws) when the key is
 * missing or the call fails, so the caller can fall back gracefully.
 */
export async function understandVoiceInput(
  audioBase64: string,
  mimeType: string
): Promise<VoiceUnderstandingResult> {
  const client = getGeminiClient();
  if (!client) {
    logger.warn("[VoiceUnderstanding] GEMINI_API_KEY not set");
    return { transcript: "", success: false };
  }

  try {
    const completion = await client.models.generateContent({
      model: AUDIO_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: AUDIO_PROMPT },
          ],
        },
      ],
      config: { temperature: 0.1, maxOutputTokens: 2000 },
    });

    const transcript = (completion.text ?? "").trim();
    logger.info("[VoiceUnderstanding] Transcribed", { chars: transcript.length });
    return { transcript, success: transcript.length > 0 };
  } catch (error) {
    console.error("[VoiceUnderstanding] Gemini audio call failed:", error);
    logger.warn("[VoiceUnderstanding] Gemini audio call failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { transcript: "", success: false };
  }
}
