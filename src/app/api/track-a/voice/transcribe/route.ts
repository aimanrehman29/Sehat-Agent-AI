/**
 * POST /api/track-a/voice/transcribe
 *
 * Dedicated endpoint for uploading audio and receiving a transcript.
 * Called by the VoiceInputMic component when the user wants to send
 * audio to Whisper before selecting which Track A agent to invoke.
 *
 * Request body (JSON):
 *   {
 *     audio_base64:   string,   // required
 *     audio_mime_type: string,  // e.g. "audio/webm"
 *   }
 *
 * Response (JSON):
 *   {
 *     transcript:          string,
 *     source:              "whisper" | "pre_transcribed" | "none",
 *     detected_language?:  string,
 *   }
 *
 * All responses include guardrail disclaimer envelope.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { transcribeVoicePayload } from "@/lib/voice/transcriber";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";

const TranscribeRequestSchema = z.object({
  audio_base64: z.string().min(1, "audio_base64 must not be empty"),
  audio_mime_type: z
    .enum([
      "audio/webm",
      "audio/webm;codecs=opus",
      "audio/wav",
      "audio/wave",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/m4a",
      "audio/x-m4a",
      "audio/ogg",
    ])
    .default("audio/webm"),
});

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const body = await request.json();
    const validated = TranscribeRequestSchema.parse(body);

    const result = await transcribeVoicePayload(
      {
        audio_base64: validated.audio_base64,
        audio_mime_type: validated.audio_mime_type,
      },
      requestId
    );

    const response = applyGuardrails({
      request_id: requestId,
      agent_source: "voice-transcribe",
      status: "success",
      result,
      confidence_score: result.source === "whisper" ? 0.92 : 0.0,
      processing_time_ms: Date.now() - startTime,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: requestId,
        agent_source: "voice-transcribe",
        error_code:
          error instanceof z.ZodError ? "INVALID_REQUEST" : "TRANSCRIPTION_ERROR",
        error_message:
          error instanceof z.ZodError
            ? error.errors[0]?.message ?? "Invalid request"
            : error instanceof Error
              ? error.message
              : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}
