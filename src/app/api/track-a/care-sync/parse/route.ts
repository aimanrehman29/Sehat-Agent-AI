/**
 * POST /api/track-a/care-sync/parse
 *
 * Care-Sync AI — Prescription Parser & Interactive Reminder System.
 * Performs OCR parsing of doctor prescriptions (parchi) to extract medicine
 * name, dosage, frequency, and time of day. Generates cron schedules and
 * persists prescriptions + reminders in the database.
 *
 * All responses are wrapped in applyGuardrails() for fail-closed enforcement.
 */

import { NextResponse } from "next/server";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";
import { CareSyncAgent } from "@/agents/track-a/careSync";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const agent = new CareSyncAgent();

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    if (!body.media_base64 && !body.media_url) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: crypto.randomUUID(),
          agent_source: "care-sync",
          error_code: "MISSING_MEDIA",
          error_message: "Please provide a prescription image.",
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
      agent_source: "care-sync",
      status: "success",
      result,
      confidence_score: 0.91,
      processing_time_ms: Date.now() - startTime,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: crypto.randomUUID(),
        agent_source: "care-sync",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
