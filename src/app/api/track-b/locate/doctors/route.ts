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

    if (!department || !areaHint) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: requestId,
          agent_source: "geo-locator",
          error_code: "VALIDATION_ERROR",
          error_message: "department and areaHint are required.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    const result = await lookupDoctors({ department, hospitalName, doctorName, areaHint });

    return NextResponse.json(
      applyGuardrails({
        request_id: requestId,
        agent_source: "geo-locator",
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
        agent_source: "geo-locator",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
