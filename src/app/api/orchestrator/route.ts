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
import type { Intent } from "@/lib/orchestrator/intentClassifier";
import {
  detectEmergency,
  executeEmergencyCheck,
} from "@/agents/track-b/emergencyEscalation";
import { generateFallbackResponse } from "@/lib/orchestrator/fallbackAssistant";
import { handleTriageChain } from "@/lib/orchestrator/triageChain";
import { executeGeoLocate } from "@/agents/track-b/geoLocator";
import { detectLocationPreference } from "@/agents/track-b/triage";
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
    const { session_id, text, latitude, longitude, province, agent_hint } = body;

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
    console.log(`[Orchestrator] Incoming`, { requestId, text, agent_hint });
    appendHistory(session_id, "user", text);

    // ── PRIORITY 1: Emergency check — always runs first, never skipped ──
    if (detectEmergency(text)) {
      console.log(`[Orchestrator] Emergency detected`, { requestId, text });
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
    let intent: Intent = classifyIntent(text);

    // agent_hint: when the user tapped a specific agent tile on the hub,
    // the chat shell pins the intent so free-text classification can't
    // misroute the conversation. "orchestrator" (free-text entry) keeps
    // the classified intent. Emergency detection above always wins.
    if (agent_hint && agent_hint !== "orchestrator") {
      const HINTED_INTENTS: Record<string, Intent> = {
        triage: "symptom_triage",
        "geo-locator": "hospital_search",
        "auto-booking": "doctor_lookup",
        // Track A direct agents normally hit their own endpoints, but map
        // their hints too in case a client routes them through here.
        "pharma-check": "drug_verification",
        "lingo-med": "lab_report",
        "care-sync": "prescription",
      };
      const hinted = HINTED_INTENTS[agent_hint as string];
      if (hinted) intent = hinted;
    }

    console.log(`[Orchestrator] Routing decision`, { requestId, classifiedIntent: classifyIntent(text), agentHint: agent_hint, finalIntent: intent });

    switch (intent) {
      case "symptom_triage":
        // Symptom-based routing — always chains through Triage → GeoLocator.
        return await handleTriageChain(
          text,
          requestId,
          session_id,
          latitude,
          longitude,
          province,
          startTime
        );

      case "hospital_search": {
        if (agent_hint === "geo-locator") {
          console.log(`[Orchestrator] agent_hint=geo-locator — bypassing Triage`, { requestId, text });

          if (latitude == null || longitude == null) {
            return NextResponse.json(
              applyErrorGuardrail({
                request_id: requestId,
                agent_source: "geo-locator",
                error_code: "LOCATION_REQUIRED",
                error_message: "Please share your location to find nearby hospitals.",
                processing_time_ms: Date.now() - startTime,
              }),
              { status: 400 }
            );
          }

          const rankingStrategy = detectLocationPreference(text);
          const geoResult = await executeGeoLocate(latitude, longitude, "hospital", requestId, rankingStrategy);
          updateSession(session_id, { last_agent_used: "geo-locator" });

          console.log(`[Orchestrator] GeoLocator direct result`, {
            requestId, rankingStrategy, facilitiesFound: geoResult.facilities?.length ?? 0,
          });

          return NextResponse.json(
            applyGuardrails({
              request_id: requestId,
              agent_source: "geo-locator",
              status: "success",
              result: geoResult,
              confidence_score: geoResult.confidence,
              processing_time_ms: Date.now() - startTime,
            })
          );
        }

        // Free-text hospital_search (no tile tap) still chains through Triage,
        // since the user may have typed an actual symptom.
        return await handleTriageChain(text, requestId, session_id, latitude, longitude, province, startTime);
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
