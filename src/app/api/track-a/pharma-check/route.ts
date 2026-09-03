/**
 * POST /api/track-a/pharma-check
 *
 * Pharma-Check AI — Fake Medicine Detector.
 * Performs 2D DataMatrix/barcode scanning aligned with DRAP serialization
 * mandate, queries the DrugRegistry, and returns the updated response schema.
 *
 * All responses are wrapped in applyGuardrails() for fail-closed enforcement.
 */

import { NextResponse } from "next/server";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";
import { PharmaCheckAgent } from "@/agents/track-a/pharmaCheck";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const agent = new PharmaCheckAgent();

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    if (!body.media_base64 && !body.media_url) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: crypto.randomUUID(),
          agent_source: "pharma-check",
          error_code: "MISSING_MEDIA",
          error_message: "Please provide an image (base64 or URL).",
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
      agent_source: "pharma-check",
      status: "success",
      result,
      confidence_score: 0.94,
      processing_time_ms: Date.now() - startTime,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: crypto.randomUUID(),
        agent_source: "pharma-check",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
