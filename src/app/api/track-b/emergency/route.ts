/**
 * POST /api/track-b/emergency
 *
 * Emergency keyword detection and escalation agent (Track B).
 * Detects emergency keywords in patient messages and triggers immediate
 * escalation protocols including first-aid instructions and ER routing.
 *
 * Mock implementation — returns realistic sample data for UI testing.
 * Replace with real NLP-based emergency detection in production.
 */

import { NextResponse } from "next/server";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";
import { executeEmergencyCheck } from "@/agents/track-b/emergencyEscalation";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    if (!body.text) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: crypto.randomUUID(),
          agent_source: "emergency",
          error_code: "MISSING_INPUT",
          error_message: "Please provide a message or transcript in the 'text' field.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    // ── Simulate NLP processing delay ──
    await new Promise((r) => setTimeout(r, 800));

    // ── Execute emergency check agent ──
    const result = await executeEmergencyCheck(
      body.text,
      crypto.randomUUID(),
      body.province
    );

    const response = applyGuardrails({
      request_id: crypto.randomUUID(),
      agent_source: "emergency",
      status: "success",
      result,
      confidence_score: result.confidence,
      processing_time_ms: Date.now() - startTime,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: crypto.randomUUID(),
        agent_source: "emergency",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
