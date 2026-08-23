/**
 * POST /api/track-a/care-sync/parse
 *
 * Mock implementation — returns realistic prescription parsing for UI testing.
 * Replace with real agent logic in Task 8.
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
          agent_source: "care-sync",
          error_code: "MISSING_MEDIA",
          error_message: "Please provide a prescription image.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    // ── Simulate OCR + parsing delay ──
    await new Promise((r) => setTimeout(r, 1800));

    // ── Mock result ──
    const result = {
      medicines: [
        {
          name: "Augmentin 625mg",
          generic_name: "Amoxicillin + Clavulanic Acid",
          dosage: "625mg",
          form: "tablet",
          frequency: "twice daily",
          duration: "7 days",
          instructions: "take after food",
        },
        {
          name: "Brufen 400mg",
          generic_name: "Ibuprofen",
          dosage: "400mg",
          form: "tablet",
          frequency: "three times daily",
          duration: "5 days",
          instructions: "take after food, avoid on empty stomach",
        },
        {
          name: "Risek 20mg",
          generic_name: "Omeprazole",
          dosage: "20mg",
          form: "capsule",
          frequency: "once daily",
          duration: "14 days",
          instructions: "take before breakfast",
        },
        {
          name: "Calpol Suspension",
          generic_name: "Paracetamol",
          dosage: "10ml",
          form: "syrup",
          frequency: "as needed",
          duration: "3 days",
          instructions: "if fever exceeds 101F, every 6 hours",
        },
      ],
      doctor_info: {
        name: "Dr. Fatima Hassan",
        clinic: "MediCare Clinic, Karachi",
        date: "2026-08-22",
        registration_no: "PMDC-45678",
      },
      reminders: [
        {
          medicine_name: "Augmentin 625mg",
          cron_expressions: ["0 8 * * *", "0 20 * * *"],
          schedule_description: "Every day at 8:00 AM and 8:00 PM for 7 days",
          next_scheduled_times: [
            "2026-08-24T08:00:00.000Z",
            "2026-08-24T20:00:00.000Z",
          ],
        },
        {
          medicine_name: "Brufen 400mg",
          cron_expressions: ["0 8 * * *", "0 14 * * *", "0 20 * * *"],
          schedule_description:
            "Every day at 8:00 AM, 2:00 PM, and 8:00 PM for 5 days",
          next_scheduled_times: [
            "2026-08-24T08:00:00.000Z",
            "2026-08-24T14:00:00.000Z",
            "2026-08-24T20:00:00.000Z",
          ],
        },
        {
          medicine_name: "Risek 20mg",
          cron_expressions: ["0 7 * * *"],
          schedule_description: "Every day at 7:00 AM for 14 days",
          next_scheduled_times: ["2026-08-24T07:00:00.000Z"],
        },
        {
          medicine_name: "Calpol Suspension",
          cron_expressions: [],
          schedule_description: "As needed — no fixed schedule",
          next_scheduled_times: [],
        },
      ],
      raw_extracted_text:
        "Rx\nAugmentin 625mg Tab — 1+0+1 x 7 days (AF)\nBrufen 400mg Tab — 1+1+1 x 5 days (AF)\nRisek 20mg Cap — 1+0+0 x 14 days (BF)\nCalpol Susp — PRN if fever >101F, q6h x 3 days\n\n— Dr. Fatima Hassan, MediCare Clinic, 22-Aug-2026",
    };

    const response = applyGuardrails({
      request_id: crypto.randomUUID(),
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
