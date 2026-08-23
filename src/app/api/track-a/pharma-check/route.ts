/**
 * POST /api/track-a/pharma-check
 *
 * Mock implementation — returns realistic sample data for UI testing.
 * Replace with real agent logic in Task 6.
 */

import { NextResponse } from "next/server";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    if (!body.media_base64 && !body.media_url) {
      return NextResponse.json(
        applyErrorGuardrail({
          request_id: crypto.randomUUID(),
          agent_source: "pharma-check",
          error_code: "MISSING_MEDIA",
          error_message: "Please provide an image (base64 or URL).",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    // ── Simulate processing delay ──
    await new Promise((r) => setTimeout(r, 1500));

    // ── Mock result ──
    const result = {
      barcode: "8901234567890",
      qr_data: "DRAP-0001-1234|Panadol|GSK",
      drap_registration_no: "DRAP-0001-1234",
      drug_found: true,
      drug_info: {
        drug_name: "Panadol",
        registration_no: "DRAP-0001-1234",
        manufacturer: "GlaxoSmithKline Pakistan",
        batch_number: "PN-2025-001",
        expiry_date: "2027-06-30",
        category: "Analgesic",
        is_active: true,
      },
      risk: {
        level: "SAFE" as const,
        score: 8,
        factors: [
          {
            description: "DRAP registration number found and verified in registry",
            severity: "info" as const,
            weight: 0.9,
          },
          {
            description: "Barcode matches registered product",
            severity: "info" as const,
            weight: 0.85,
          },
          {
            description: "Batch number is valid and not expired",
            severity: "info" as const,
            weight: 0.95,
          },
        ],
      },
      warnings: [],
    };

    const response = applyGuardrails({
      request_id: crypto.randomUUID(),
      agent_source: "pharma-check",
      status: "success",
      result,
      confidence_score: 0.94,
      processing_time_ms: Date.now() - startTime,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: crypto.randomUUID(),
        agent_source: "pharma-check",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
