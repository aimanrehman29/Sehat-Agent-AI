/**
 * POST /api/track-a/lingo-med
 *
 * Mock implementation — returns realistic lab report analysis for UI testing.
 * Replace with real agent logic in Task 7.
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
          agent_source: "lingo-med",
          error_code: "MISSING_MEDIA",
          error_message: "Please provide a lab report image or PDF.",
          processing_time_ms: Date.now() - startTime,
        }),
        { status: 400 }
      );
    }

    // ── Simulate OCR + analysis delay ──
    await new Promise((r) => setTimeout(r, 2000));

    // ── Mock result ──
    const allMetrics = [
      {
        test_name: "Hemoglobin",
        value: 14.2,
        unit: "g/dL",
        reference_low: 13.0,
        reference_high: 17.0,
        severity: "NORMAL" as const,
      },
      {
        test_name: "Fasting Blood Glucose",
        value: 138,
        unit: "mg/dL",
        reference_low: 70,
        reference_high: 100,
        severity: "ABNORMAL" as const,
      },
      {
        test_name: "Total Cholesterol",
        value: 215,
        unit: "mg/dL",
        reference_low: null,
        reference_high: 200,
        severity: "BORDERLINE" as const,
      },
      {
        test_name: "HDL Cholesterol",
        value: 55,
        unit: "mg/dL",
        reference_low: 40,
        reference_high: null,
        severity: "NORMAL" as const,
      },
      {
        test_name: "LDL Cholesterol",
        value: 142,
        unit: "mg/dL",
        reference_low: null,
        reference_high: 130,
        severity: "BORDERLINE" as const,
      },
      {
        test_name: "Triglycerides",
        value: 165,
        unit: "mg/dL",
        reference_low: null,
        reference_high: 150,
        severity: "BORDERLINE" as const,
      },
      {
        test_name: "Creatinine",
        value: 0.9,
        unit: "mg/dL",
        reference_low: 0.7,
        reference_high: 1.3,
        severity: "NORMAL" as const,
      },
      {
        test_name: "TSH",
        value: 5.8,
        unit: "mIU/L",
        reference_low: 0.4,
        reference_high: 4.0,
        severity: "ABNORMAL" as const,
      },
    ];

    const flaggedMetrics = allMetrics.filter(
      (m) => m.severity !== "NORMAL"
    );

    const result = {
      patient_info: {
        name: "Ahmed Khan",
        age: 45,
        gender: "Male",
        report_date: "2026-08-20",
        lab_name: "Chughtai Lab, Lahore",
      },
      metrics: allMetrics,
      flagged_metrics: flaggedMetrics,
      summary:
        "Your blood sugar and thyroid levels need attention. Fasting glucose is elevated at 138 mg/dL (normal: 70-100), which may indicate pre-diabetes or diabetes. Your TSH is high at 5.8 mIU/L, suggesting an underactive thyroid (hypothyroidism). Cholesterol and triglycerides are slightly above ideal levels. Kidney function (creatinine) and hemoglobin are normal. Please consult your doctor for the sugar and thyroid findings.",
      explanations: [
        {
          test_name: "Fasting Blood Glucose",
          explanation:
            "Your fasting sugar level is 138 mg/dL, which is above the normal range of 70-100 mg/dL. Levels between 100-125 suggest pre-diabetes, and above 126 may indicate diabetes. This means your body is having difficulty processing sugar properly.",
          severity: "ABNORMAL" as const,
          suggestion:
            "See your doctor for a follow-up HbA1c test to confirm. Reduce sugary foods and drinks, and increase physical activity.",
        },
        {
          test_name: "TSH",
          explanation:
            "Your Thyroid Stimulating Hormone (TSH) is 5.8 mIU/L, which is above the normal range of 0.4-4.0. A high TSH means your thyroid gland is underactive (hypothyroidism) — it's not producing enough thyroid hormone, so your brain is sending more TSH to stimulate it.",
          severity: "ABNORMAL" as const,
          suggestion:
            "Consult an endocrinologist. You may need thyroid medication (Levothyroxine). Common symptoms include fatigue, weight gain, and feeling cold.",
        },
        {
          test_name: "Total Cholesterol",
          explanation:
            "Your total cholesterol is 215 mg/dL, slightly above the desirable level of 200 mg/dL. This is a borderline reading that warrants lifestyle attention.",
          severity: "BORDERLINE" as const,
          suggestion:
            "Reduce fried and fatty foods. Exercise 30 minutes daily. Recheck in 3 months.",
        },
        {
          test_name: "LDL Cholesterol",
          explanation:
            "LDL (bad cholesterol) is 142 mg/dL, above the ideal level of 130 mg/dL. High LDL can build up in your arteries over time.",
          severity: "BORDERLINE" as const,
          suggestion:
            "Increase fiber intake (oats, fruits, vegetables). Limit red meat and cheese. Regular exercise helps lower LDL.",
        },
        {
          test_name: "Triglycerides",
          explanation:
            "Triglycerides at 165 mg/dL are slightly elevated (normal: below 150). These are a type of fat in your blood that increases with sugary and starchy foods.",
          severity: "BORDERLINE" as const,
          suggestion:
            "Reduce sugar, white bread, and rice intake. Walking after meals helps lower triglycerides.",
        },
      ],
    };

    const response = applyGuardrails({
      request_id: crypto.randomUUID(),
      agent_source: "lingo-med",
      status: "success",
      result,
      confidence_score: 0.88,
      processing_time_ms: Date.now() - startTime,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: crypto.randomUUID(),
        agent_source: "lingo-med",
        error_code: "AGENT_ERROR",
        error_message: error instanceof Error ? error.message : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500 }
    );
  }
}
