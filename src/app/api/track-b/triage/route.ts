/**
 * POST /api/track-b/triage
 *
 * Symptom → department routing agent (Track B).
 * Analyzes patient symptom descriptions and routes them to the appropriate
 * medical department or specialist.
 *
 * Mock implementation — returns realistic sample data for UI testing.
 * Replace with real NLP-based classification in production.
 */

import { NextResponse } from "next/server";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";
import { executeTriage } from "@/agents/track-b/triage";
import { executeEmergencyCheck } from "@/agents/track-b/emergencyEscalation";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    if (!body.text) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: crypto.randomUUID(),
          agent_source: "triage",
          error_code: "MISSING_INPUT",
          error_message: "Please provide a symptom description in the 'text' field.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    // ── Simulate NLP processing delay ──
    await new Promise((r) => setTimeout(r, 1200));

    const requestId = crypto.randomUUID();

    // ── Emergency check — runs on EVERY request unconditionally ──
    // Catches both physical emergencies and mental health crises.
    // If detected, emergency response takes priority over department routing.
    const emergencyResult = await executeEmergencyCheck(
      body.text,
      requestId,
      body.province
    );

    if (emergencyResult.is_emergency) {
      const response = applyGuardrails({
        request_id: requestId,
        agent_source: "triage",
        status: "success",
        result: emergencyResult,
        confidence_score: emergencyResult.confidence,
        processing_time_ms: Date.now() - startTime,
      });
      return NextResponse.json(response);
    }

    // ── No emergency detected — proceed with normal department triage ──
    const triageResult = await executeTriage(body.text, requestId);

    const response = applyGuardrails({
      request_id: requestId,
      agent_source: "triage",
      status: "success",
      result: triageResult,
      confidence_score: triageResult.confidence,
      processing_time_ms: Date.now() - startTime,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: crypto.randomUUID(),
        agent_source: "triage",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
