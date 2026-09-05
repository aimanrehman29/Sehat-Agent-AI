/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/orchestrator — Single entry point for the Sehat-Agent AI homepage.
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
import { extractDoctorQueryFields } from "@/agents/track-b/doctorLookup";
import {
  isDiagnosticRequest,
  DIAGNOSTIC_BOUNDARY_MESSAGE,
} from "@/lib/orchestrator/diagnosticRequestDetector";
import { handleTriageChain } from "@/lib/orchestrator/triageChain";
import { executeGeoLocate } from "@/agents/track-b/geoLocator";
import { detectLocationPreference } from "@/agents/track-b/triage";
import {
  applyGuardrails,
  applyErrorGuardrail,
} from "@/lib/guardrails/disclaimer";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Map of routable intents to their hub tile IDs (frontend navigation targets).
// appointment_booking is NOT in this map — it resolves with its own answer
// directly in place, since the booking message is identical regardless of
// which screen it's shown on.
const INTENT_TO_AGENT_SCREEN: Record<string, string> = {
  symptom_triage: "triage",
  hospital_search: "geo-locator",
  drug_verification: "pharma-check",
  lab_report: "lingo-med",
  prescription: "care-sync",
  doctor_lookup: "doctor-lookup",
};

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

    // ── PRIORITY 1.5: Diagnostic-request boundary — checked before normal routing ──
    // Explicit diagnosis-seeking gets the assist-not-diagnose boundary message
    // in place, no navigation. Deliberately AFTER emergency detection.
    if (isDiagnosticRequest(text)) {
      console.log(`[Orchestrator] Diagnostic request detected`, { requestId, text });
      updateSession(session_id, { last_agent_used: "orchestrator" });
      return NextResponse.json(
        applyGuardrails({
          request_id: requestId,
          agent_source: "orchestrator",
          status: "success",
          result: {
            summary_text: DIAGNOSTIC_BOUNDARY_MESSAGE,
            source: "diagnostic_boundary",
          },
          confidence_score: 1,
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
        "auto-booking": "appointment_booking",
        "doctor-lookup": "doctor_lookup",
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

    // Own-screen navigation: when the user is on the Orchestrator's own
    // free-text screen (no specific tile hint) and the intent maps to a real
    // agent screen, return a navigation instruction instead of processing
    // in place. A specific tile's agent_hint (user already on the right
    // screen) keeps the current in-place behavior below.
    const isOwnScreen = !agent_hint || agent_hint === "orchestrator";
    const navigationTarget = INTENT_TO_AGENT_SCREEN[intent];
    if (isOwnScreen && navigationTarget) {
      console.log(`[Orchestrator] Navigating to agent screen`, { requestId, intent, navigationTarget });
      updateSession(session_id, { last_agent_used: "orchestrator" });
      return NextResponse.json(
        applyGuardrails({
          request_id: requestId,
          agent_source: "orchestrator",
          status: "success",
          result: {
            action: "navigate",
            target_agent_id: navigationTarget,
            carry_text: text,
            summary_text: "Let me take you there...",
          },
          confidence_score: 0.8,
          processing_time_ms: Date.now() - startTime,
        })
      );
    }

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

      case "appointment_booking": {
        console.log(`[Orchestrator] Appointment booking requested — not live yet`, { requestId, text });
        updateSession(session_id, { last_agent_used: "auto-booking" });
        return NextResponse.json(
          applyGuardrails({
            request_id: requestId,
            agent_source: "auto-booking",
            status: "success",
            result: {
              summary_text:
                "Appointment booking is currently under active development and testing. " +
                "For now, you can look up a doctor's hospital and timings, or find the " +
                "nearest open hospital and contact them directly.",
            },
            confidence_score: 1,
            processing_time_ms: Date.now() - startTime,
          })
        );
      }

      case "doctor_lookup": {
        console.log(`[Orchestrator] Doctor lookup requested`, { requestId, text });
        const recentHistory = session.conversation_history.slice(-6);
        const extraction = await extractDoctorQueryFields(text, recentHistory);
        console.log(`[Orchestrator] Doctor lookup extraction`, { requestId, extraction });
        if (extraction.needsClarification) {
          updateSession(session_id, { last_agent_used: "doctor-lookup" });
          return NextResponse.json(
            applyGuardrails({
              request_id: requestId,
              agent_source: "doctor-lookup",
              status: "success",
              result: {
                summary_text:
                  extraction.clarifyingQuestion ??
                  "Which doctor or specialty are you looking for, and in which city?",
              },
              confidence_score: 0.3,
              processing_time_ms: Date.now() - startTime,
            })
          );
        }
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
          const doctorRes = await fetch(`${baseUrl}/api/track-b/locate/doctors`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              department: extraction.department,
              doctorName: extraction.doctorName,
              hospitalName: extraction.hospitalName,
              areaHint: extraction.areaHint,
            }),
          });
          const doctorData = await doctorRes.json();
          updateSession(session_id, { last_agent_used: "doctor-lookup" });
          return NextResponse.json(doctorData, { status: doctorRes.status });
        } catch (error) {
          return NextResponse.json(
            applyErrorGuardrail({
              request_id: requestId,
              agent_source: "doctor-lookup",
              error_code: "ROUTING_FAILED",
              error_message: "Could not connect to the doctor lookup agent. Please try again.",
              processing_time_ms: Date.now() - startTime,
            }),
            { status: 500 }
          );
        }
      }

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
