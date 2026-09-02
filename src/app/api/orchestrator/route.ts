/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/orchestrator — Single entry point for the Sehat-Assist AI homepage.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Priority order is NOT optional:
 *   1. Emergency detection — ALWAYS runs first, before intent classification,
 *      before consent check, before anything else. A person in crisis should
 *      never be blocked by a consent modal or misrouted by the keyword classifier.
 *   2. Intent classification — routes to the appropriate agent or chain.
 *   3. Fallback assistant — handles unmatched intents gracefully.
 *
 * This is a TEXT-ONLY endpoint. File uploads (drug photos, lab reports,
 * prescriptions) should be routed directly to the matching Track A endpoint
 * from the UI — they don't pass through this Orchestrator.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateSession,
  updateSession,
  appendHistory,
} from "@/lib/orchestrator/sessionStore";
import { classifyIntent } from "@/lib/orchestrator/intentClassifier";
import {
  detectEmergency,
  executeEmergencyCheck,
} from "@/agents/track-b/emergencyEscalation";
import { generateFallbackResponse } from "@/lib/orchestrator/fallbackAssistant";
import { handleTriageChain } from "@/lib/orchestrator/triageChain";
import {
  applyGuardrails,
  applyErrorGuardrail,
} from "@/lib/guardrails/disclaimer";

// ─── Main Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const body = await req.json();
    const { session_id, text, latitude, longitude, province } = body;

    // ── Validation ──
    if (!session_id || !text) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: requestId,
          agent_source: "orchestrator",
          error_code: "VALIDATION_ERROR",
          error_message: "session_id and text are required.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    const session = getOrCreateSession(session_id);
    appendHistory(session_id, "user", text);

    // ── PRIORITY 1: Emergency check — always runs first, never skipped ──
    if (detectEmergency(text)) {
      const emergencyResult = await executeEmergencyCheck(
        text,
        requestId,
        province
      );

      updateSession(session_id, { last_agent_used: "emergency-escalation" });

      return NextResponse.json(
        applyGuardrails({
          request_id: requestId,
          agent_source: "emergency-escalation",
          status: "success",
          result: emergencyResult,
          confidence_score: emergencyResult.confidence,
          processing_time_ms: Date.now() - startTime,
        })
      );
    }

    // ── PRIORITY 2: Classify intent and route ──
    const intent = classifyIntent(text);

    switch (intent) {
      case "symptom_triage":
      case "hospital_search": {
        // Chained flow — Triage → GeoLocator handoff (Section D).
        return await handleTriageChain(
          text,
          requestId,
          session_id,
          latitude,
          longitude,
          province,
          startTime
        );
      }

      case "doctor_lookup":
        // Delegate directly — full body already has what /locate/doctors needs.
        // Not wired in this task — call /api/track-b/locate/doctors directly
        // from the UI for now, or extend this case if you want it fully chained.
        return NextResponse.json(
          applyErrorGuardrail({
            request_id: requestId,
            agent_source: "orchestrator",
            error_code: "NOT_YET_WIRED",
            error_message:
              "Doctor lookup routing from the Orchestrator is not wired in this task — " +
              "call /api/track-b/locate/doctors directly from the UI for now, or extend this " +
              "case if you want it fully chained.",
            processing_time_ms: Date.now() - startTime,
          }),
          { status: 501 }
        );

      case "drug_verification":
      case "lab_report":
      case "prescription":
        // These require an uploaded image/PDF, which this text-only entry point
        // doesn't carry. The real homepage (PDF 4) should route file uploads
        // directly to the matching Track A endpoint.
        return NextResponse.json(
          applyErrorGuardrail({
            request_id: requestId,
            agent_source: "orchestrator",
            error_code: "REQUIRES_FILE_UPLOAD",
            error_message: `This request needs an uploaded image or PDF. Please use the ${intent.replace("_", " ")} upload option.`,
            processing_time_ms: Date.now() - startTime,
          }),
          { status: 400 }
        );

      case "unknown":
      default: {
        // ── Fallback assistant (Section E) ──
        const fallback = await generateFallbackResponse(
          text,
          session.conversation_history
        );

        appendHistory(session_id, "assistant", fallback.summary_text);
        updateSession(session_id, { last_agent_used: "fallback-assistant" });

        return NextResponse.json(
          applyGuardrails({
            request_id: requestId,
            agent_source: "orchestrator",
            status: "success",
            result: fallback,
            confidence_score: 0.4,
            processing_time_ms: Date.now() - startTime,
          })
        );
      }
    }
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
