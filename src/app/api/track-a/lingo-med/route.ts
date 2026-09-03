/**
 * POST /api/track-a/lingo-med
 *
 * Lingo-Med AI — Lab Report Simplifier.
 * Performs OCR processing of uploaded lab reports, severity classification
 * (NORMAL, BORDERLINE, ABNORMAL, CRITICAL), and plain-text translation.
 *
 * All responses are wrapped in applyGuardrails() for fail-closed enforcement.
 */

import { NextResponse } from "next/server";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";
import { LingoMedAgent } from "@/agents/track-a/lingoMed";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const agent = new LingoMedAgent();

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    if (!body.media_base64 && !body.media_url) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: crypto.randomUUID(),
          agent_source: "lingo-med",
          error_code: "MISSING_MEDIA",
          error_message: "Please provide a lab report image or PDF.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    // ── Execute real agent pipeline ──
    const requestId = crypto.randomUUID();
    const result = await agent.execute(body, requestId);

    const response = applyGuardrails({
      request_id: requestId,
      agent_source: "lingo-med",
      status: "success",
      result,
      confidence_score: 0.88,
      processing_time_ms: Date.now() - startTime,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: crypto.randomUUID(),
        agent_source: "lingo-med",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
