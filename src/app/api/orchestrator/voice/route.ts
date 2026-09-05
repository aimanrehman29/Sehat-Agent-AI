/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/orchestrator/voice — Voice entry point for the Orchestrator.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Replaces the browser's unreliable Web Speech API transcription with real
 * server-side Gemini audio understanding: the recorded audio is sent to
 * Gemini (via voiceUnderstanding.ts), which transcribes AND translates it
 * to English. The resulting English text is then relayed to the existing
 * /api/orchestrator endpoint — same server-to-server relay pattern already
 * used by the doctor_lookup case — so no routing/intent logic is duplicated.
 *
 * Attaches `result.heard_text` to the orchestrator's response so the UI can
 * show what was actually heard, for transparency.
 */

import { NextRequest, NextResponse } from "next/server";
import { understandVoiceInput } from "@/agents/track-b/voiceUnderstanding";
import { applyErrorGuardrail } from "@/lib/guardrails/disclaimer";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const body = await req.json();
    const { session_id, audio_base64, audio_mime_type, latitude, longitude, province, agent_hint } = body;

    if (!session_id || !audio_base64) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: requestId,
          agent_source: "orchestrator",
          error_code: "VALIDATION_ERROR",
          error_message: "session_id and audio_base64 are required.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    console.log(`[VoiceRoute] Understanding audio`, { requestId, mimeType: audio_mime_type });
    const understanding = await understandVoiceInput(audio_base64, audio_mime_type || "audio/webm");

    if (!understanding.success || !understanding.transcript) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: requestId,
          agent_source: "orchestrator",
          error_code: "VOICE_UNDERSTANDING_FAILED",
          error_message: "Couldn't understand that recording. Please try again or type instead.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 502 }
      );
    }

    console.log(`[VoiceRoute] Understood as`, { requestId, transcript: understanding.transcript });

    // Relay to the existing text orchestrator — identical routing/intent
    // logic, no duplication.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const orchestratorRes = await fetch(`${baseUrl}/api/orchestrator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id, text: understanding.transcript, latitude, longitude, province, agent_hint,
      }),
    });
    const orchestratorData = await orchestratorRes.json();

    // Attach what was actually heard, so the UI can show it for transparency.
    if (orchestratorData?.result) {
      orchestratorData.result.heard_text = understanding.transcript;
    }

    return NextResponse.json(orchestratorData, { status: orchestratorRes.status });
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: requestId,
        agent_source: "orchestrator",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
