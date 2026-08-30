/**
 * POST /api/track-b/book
 *
 * Auto-Booking agent (Track B).
 * Initiates an AI-disclosed Twilio voice call to request a hospital
 * appointment and returns a digital E-Parchi (appointment slip).
 */

import { NextResponse } from "next/server";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";
import { executeAutoBooking } from "@/agents/track-b/autoBooking";
import { validateBookingRequest } from "@/lib/validation/booking.schema";
import { ZodError } from "zod";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const rawBody = await request.json();

    // ── Validate request payload ──
    let body;
    try {
      body = validateBookingRequest(rawBody);
    } catch (validationError) {
      if (validationError instanceof ZodError) {
        return NextResponse.json(
          applyErrorGuardrail({
            request_id: crypto.randomUUID(),
            agent_source: "auto-booking",
            error_code: "VALIDATION_ERROR",
            error_message: validationError.errors
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join("; "),
            processing_time_ms: Date.now() - startTime,
          }),
          { status: 400 }
        );
      }
      throw validationError;
    }

    const requestId = crypto.randomUUID();

    // ── Execute auto-booking agent (places Twilio call + generates E-Parchi) ──
    const result = await executeAutoBooking(
      body.patientName,
      body.department,
      body.hospitalName,
      body.requestedTime,
      requestId,
      body.distanceKm
    );

    const response = applyGuardrails({
      request_id: requestId,
      agent_source: "auto-booking",
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
        agent_source: "auto-booking",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
