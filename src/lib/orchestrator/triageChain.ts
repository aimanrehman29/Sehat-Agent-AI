/**
 * ─────────────────────────────────────────────────────────────────────────────
 * triageChain.ts — Triage → GeoLocator chaining helper.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is what makes the Orchestrator feel like ONE assistant instead of
 * separate disconnected agents: the user describes a symptom once, and
 * Triage's department + location preference are handed straight into
 * GeoLocator automatically — the user is never asked to repeat what
 * department they need.
 *
 * Flow:
 *   1. Run Triage on the user's text → get department + ranking preference
 *   2. If lat/lng available → chain into GeoLocator using Triage's output
 *   3. If no location yet → return Triage result alone (UI prompts for location)
 */

import { NextResponse } from "next/server";
import { executeTriage } from "@/agents/track-b/triage";
import { executeGeoLocate } from "@/agents/track-b/geoLocator";
import { updateSession } from "@/lib/orchestrator/sessionStore";
import { applyGuardrails } from "@/lib/guardrails/disclaimer";
import type { GeoLocatorResult } from "@/types/orchestrator";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Execute the Triage → GeoLocator chain.
 *
 * @param text - The user's symptom description
 * @param requestId - Request identifier for tracing
 * @param sessionId - Session identifier for state persistence
 * @param latitude - GPS latitude (may be missing on first turn)
 * @param longitude - GPS longitude (may be missing on first turn)
 * @param province - Patient's province (for emergency service routing)
 * @param startTime - Timestamp for processing_time_ms calculation
 * @returns NextResponse with either Triage alone or chained Triage+GeoLocator result
 */
export async function handleTriageChain(
  text: string,
  requestId: string,
  sessionId: string,
  latitude: number | undefined,
  longitude: number | undefined,
  _province: string | undefined,
  startTime: number
): Promise<NextResponse> {
  // ── Step 1: Run Triage ──
  const triageResult = await executeTriage(text, requestId);

  updateSession(sessionId, {
    last_triage_department: triageResult.department,
    last_triage_location_preference: triageResult.suggested_location_preference,
    last_agent_used: "triage",
    ...(latitude != null && longitude != null
      ? { last_location: { latitude, longitude } }
      : {}),
  });

  // ── Step 2a: No location yet — return Triage result alone ──
  // The UI should prompt for location, then call again on the next turn.
  if (latitude == null || longitude == null) {
    return NextResponse.json(
      applyGuardrails({
        request_id: requestId,
        agent_source: "triage",
        status: "success",
        result: triageResult,
        confidence_score: triageResult.confidence,
        processing_time_ms: Date.now() - startTime,
      })
    );
  }

  // ── Step 2b: Location available — chain into GeoLocator ──
  // Uses Triage's own department + ranking preference so the user isn't asked twice.
  const geoResult = await executeGeoLocate(
    latitude,
    longitude,
    "hospital",
    requestId,
    triageResult.suggested_location_preference,
    triageResult.department
  );

  updateSession(sessionId, { last_agent_used: "geo-locator" });

  // The combined result includes triage_context so the frontend can display
  // the department recommendation alongside the facilities list.
  // Type assertion needed because the combined shape extends GeoLocatorResult
  // with an extra field not in the base type.
  const combinedResult = {
    ...geoResult,
    triage_context: triageResult,
  } as GeoLocatorResult;

  return NextResponse.json(
    applyGuardrails({
      request_id: requestId,
      agent_source: "geo-locator",
      status: "success",
      result: combinedResult,
      confidence_score: geoResult.confidence,
      processing_time_ms: Date.now() - startTime,
    })
  );
}
