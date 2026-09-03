/**
 * ─────────────────────────────────────────────────────────────────────────────
 * transcriber.ts — Speech-to-text handler for voice input.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Wraps OpenAI Whisper API (server-side) for high-quality transcription
 * supporting both English and Urdu (eng+urd).
 *
 * Strategy:
 *   1. If `transcript_text` is already present in the payload, use it directly
 *      (client pre-transcribed via Web Speech API — no server cost).
 *   2. If `audio_base64` is present and GEMINI_2_KEY is configured, send the
 *      audio to Gemini and return the transcript.
 *   3. If Gemini is unavailable, fall back to OpenAI Whisper (OPENAI_API_KEY).
 *   4. If neither is available, return an empty transcript (agents fall back
 *      to image-only context).
 *
 * Supported audio MIME types:
 *   audio/webm, audio/wav, audio/mpeg (mp3), audio/mp4 (m4a), audio/ogg
 */

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { logger } from "@/lib/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Voice payload as sent from the browser / API caller. */
export interface VoicePayload {
  /** Raw audio data encoded as base64. */
  audio_base64?: string;
  /** MIME type of the audio data (e.g. "audio/webm"). */
  audio_mime_type?: string;
  /**
   * Pre-transcribed text (e.g. from the Web Speech API in the browser).
   * When provided, server-side transcription is skipped entirely.
   */
  transcript_text?: string;
}

/** Result returned by `transcribeVoicePayload`. */
export interface TranscriptionResult {
  /** Final transcript text (may be empty string if transcription found nothing). */
  transcript: string;
  /**
   * How the transcript was obtained:
   * - "pre_transcribed"  — caller already sent `transcript_text`
   * - "gemini"           — sent to Gemini (GEMINI_2_KEY)
   * - "whisper"          — sent to OpenAI Whisper
   * - "none"             — no audio / no key available
   */
  source: "pre_transcribed" | "gemini" | "whisper" | "none";
  /** Detected language code if Whisper returned one (e.g. "ur", "en"). */
  detected_language?: string;
}

// ─── MIME → file-extension map ────────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
};

// ─── Lazy Gemini client (preferred provider) ──────────────────────────────────

/** Gemini model used for audio transcription. */
const GEMINI_TRANSCRIBE_MODEL = "gemini-3.6-flash";

let _gemini: GoogleGenAI | null | undefined;

function getGeminiClient(): GoogleGenAI | null {
  if (_gemini !== undefined) return _gemini;
  const apiKey = process.env.GEMINI_2_KEY;
  _gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;
  return _gemini;
}

// ─── Lazy OpenAI client (fallback provider) ────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  _openai = new OpenAI({ apiKey });
  return _openai;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Resolve a `VoicePayload` to a plain transcript string.
 *
 * @param payload  Voice payload from the request body.
 * @param requestId  Request ID for structured logging.
 * @returns TranscriptionResult — always resolves, never rejects.
 */
export async function transcribeVoicePayload(
  payload: VoicePayload | undefined | null,
  requestId: string
): Promise<TranscriptionResult> {
  if (!payload) {
    return { transcript: "", source: "none" };
  }

  // ── Fast path: caller already has the transcript ──
  if (payload.transcript_text && payload.transcript_text.trim().length > 0) {
    logger.debug("[Transcriber] Using pre-transcribed text", {
      requestId,
      chars: payload.transcript_text.length,
    });
    return {
      transcript: payload.transcript_text.trim(),
      source: "pre_transcribed",
    };
  }

  // ── Server-side path: audio buffer present, transcribe via provider chain ──
  if (!payload.audio_base64) {
    return { transcript: "", source: "none" };
  }

  const mimeType = payload.audio_mime_type ?? "audio/webm";

  // ── Gemini path (GEMINI_2_KEY) — preferred ──
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: GEMINI_TRANSCRIBE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Transcribe this audio clip exactly as spoken. It may be in " +
                  "English, Urdu, or a mix of both. Reply with only the " +
                  "transcript text — no labels, no commentary.",
              },
              { inlineData: { data: payload.audio_base64, mimeType } },
            ],
          },
        ],
      });

      const transcript = response.text?.trim() ?? "";

      logger.info("[Transcriber] Gemini transcription complete", {
        requestId,
        chars: transcript.length,
      });

      return { transcript, source: "gemini" };
    } catch (error) {
      logger.warn(
        "[Transcriber] Gemini transcription failed — falling back to Whisper",
        {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  } else {
    logger.debug("[Transcriber] GEMINI_2_KEY not set — trying Whisper", {
      requestId,
    });
  }

  const openai = getOpenAIClient();
  if (!openai) {
    logger.warn(
      "[Transcriber] Neither GEMINI_2_KEY nor OPENAI_API_KEY set — voice transcription skipped",
      { requestId }
    );
    return { transcript: "", source: "none" };
  }

  try {
    const ext = MIME_TO_EXT[mimeType] ?? "webm";

    // Decode base64 → Buffer → File-like object for the Whisper endpoint
    const audioBuffer = Buffer.from(payload.audio_base64, "base64");

    // The OpenAI Node SDK expects a `File` or `Blob`-like object.
    // We construct a `File` from the Buffer using the global `File` constructor
    // (Node 20+) or a simple Blob-based shim for earlier Node versions.
    const audioFile = new File([audioBuffer], `recording.${ext}`, {
      type: mimeType,
    });

    logger.debug(
      `[Transcriber] Sending ${(audioBuffer.length / 1024).toFixed(1)} KB to Whisper`,
      { requestId, mimeType }
    );

    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      // Hint both languages so Whisper can switch mid-utterance
      language: undefined, // auto-detect (handles Urdu + English mixing)
      response_format: "verbose_json",
    });

    const transcript = response.text?.trim() ?? "";
    const detectedLang = (response as unknown as Record<string, unknown>).language as string | undefined;

    logger.info("[Transcriber] Whisper transcription complete", {
      requestId,
      chars: transcript.length,
      language: detectedLang,
    });

    return {
      transcript,
      source: "whisper",
      detected_language: detectedLang,
    };
  } catch (error) {
    logger.warn("[Transcriber] Whisper API call failed — continuing without transcript", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { transcript: "", source: "none" };
  }
}
