/**
 * POST /api/track-b/locate
 *
 * Nearest hospital lookup agent (Track B).
 * Uses GPS coordinates to find nearby hospitals, clinics, and pharmacies.
 *
 * Mock implementation — returns realistic sample data for UI testing.
 * Replace with real Google Maps Places API calls in production.
 */

import { NextResponse } from "next/server";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";
import { executeGeoLocate } from "@/agents/track-b/geoLocator";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    if (body.latitude == null || body.longitude == null) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: crypto.randomUUID(),
          agent_source: "geo-locator",
          error_code: "MISSING_LOCATION",
          error_message: "Please provide 'latitude' and 'longitude' coordinates.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    // ── Simulate API processing delay ──
    await new Promise((r) => setTimeout(r, 1000));

    // ── Execute geo-locator agent ──
    const result = await executeGeoLocate(
      body.latitude,
      body.longitude,
      body.facility_type,
      crypto.randomUUID()
    );

    const response = applyGuardrails({
      request_id: crypto.randomUUID(),
      agent_source: "geo-locator",
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
        agent_source: "geo-locator",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
