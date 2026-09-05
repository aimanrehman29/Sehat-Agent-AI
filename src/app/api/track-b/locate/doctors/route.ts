import { NextRequest, NextResponse } from "next/server";
import { lookupDoctors } from "@/agents/track-b/doctorLookup";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const body = await req.json();
    const { department, hospitalName, doctorName, areaHint } = body;

    if (!areaHint || (!department && !doctorName)) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: requestId,
          agent_source: "doctor-lookup",
          error_code: "VALIDATION_ERROR",
          error_message: "areaHint and at least one of department or doctorName are required.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    const result = await lookupDoctors({ department, hospitalName, doctorName, areaHint });

    return NextResponse.json(
      applyGuardrails({
        request_id: requestId,
        agent_source: "doctor-lookup",
        status: "success",
        result,
        confidence_score: result.found ? 0.7 : 0,
        processing_time_ms: Date.now() - startTime,
      })
    );
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: requestId,
        agent_source: "doctor-lookup",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
