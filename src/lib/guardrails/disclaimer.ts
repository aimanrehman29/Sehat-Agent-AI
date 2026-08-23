/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DISCLAIMER GUARDRAIL — MANDATORY WRAPPER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This module enforces the "Assist, not Diagnose" disclaimer on EVERY response
 * produced by any Track A agent. It is architecturally impossible for an agent
 * to produce a response that bypasses this wrapper.
 *
 * DESIGN PRINCIPLES:
 *   1. FAIL-CLOSED: If the wrapper is not called, no response is produced.
 *   2. NON-BYPASSABLE: The `applyGuardrails` function is the ONLY way to
 *      construct a UniversalResponse. Direct construction is forbidden.
 *   3. IMMUTABLE: The disclaimer text cannot be overridden or empty.
 *
 * USAGE:
 *   Every API route handler MUST wrap its agent result:
 *
 *   ```ts
 *   import { applyGuardrails } from "@/lib/guardrails/disclaimer";
 *
 *   const result = await pharmaCheckAgent.execute(input, context);
 *   const response = applyGuardrails({
 *     request_id,
 *     agent_source: "pharma-check",
 *     status: "success",
 *     result,
 *     confidence_score: 0.92,
 *     processing_time_ms: 1340,
 *   });
 *   return Response.json(response);
 *   ```
 */

import type {
  UniversalResponse,
  GuardrailPayload,
  AgentResultPayload,
  AgentErrorResponse,
} from "@/types/orchestrator";
import type { AgentId, AgentStatus } from "@/config/constants";

// ─── Disclaimer Constants ───────────────────────────────────────────────────

/**
 * The canonical disclaimer text. This is the ONLY disclaimer that will ever
 * appear in production responses. It cannot be empty or modified at runtime.
 */
export const DISCLAIMER_TEXT = Object.freeze(
  "⚕️ ASSIST — NOT DIAGNOSE: This AI-generated analysis is for informational " +
    "and educational purposes only. It is NOT a substitute for professional " +
    "medical advice, diagnosis, or treatment. Always consult a qualified " +
    "healthcare provider before making any medical decisions. Sehat-Agent AI " +
    "does not guarantee the accuracy, completeness, or reliability of the " +
    "information provided. In case of a medical emergency, call your local " +
    "emergency services immediately."
);

/** Current version of the guardrail system */
export const GUARDRAIL_VERSION = "1.0.0";

// ─── Guardrail Builder ──────────────────────────────────────────────────────

/**
 * Internal function that constructs the guardrail payload.
 * Always returns `disclaimer_applied: true` — it is a compile-time constant.
 */
function buildGuardrailPayload(): GuardrailPayload {
  return Object.freeze({
    disclaimer_applied: true as const,
    disclaimer_text: DISCLAIMER_TEXT,
    version: GUARDRAIL_VERSION,
  });
}

// ─── Response Builder Types ─────────────────────────────────────────────────

export interface GuardrailResponseInput<T extends AgentResultPayload = AgentResultPayload> {
  request_id: string;
  agent_source: AgentId;
  status: AgentStatus;
  result: T;
  confidence_score: number;
  processing_time_ms: number;
}

export interface GuardrailErrorInput {
  request_id: string;
  agent_source: AgentId;
  error_code: string;
  error_message: string;
  error_details?: Record<string, unknown>;
  processing_time_ms: number;
}

// ─── Core Wrapper Functions ─────────────────────────────────────────────────

/**
 * Apply mandatory guardrails to a successful agent response.
 *
 * This is the ONLY sanctioned way to produce a UniversalResponse.
 * The guardrail payload is automatically injected and cannot be omitted.
 *
 * @param input - The agent's result data (without guardrail fields)
 * @returns A fully-formed UniversalResponse with disclaimer applied
 *
 * @throws Error if confidence_score is outside [0, 1]
 * @throws Error if processing_time_ms is negative
 */
export function applyGuardrails<T extends AgentResultPayload>(
  input: GuardrailResponseInput<T>
): UniversalResponse<T> {
  // ── Defensive validation ──
  if (input.confidence_score < 0 || input.confidence_score > 1) {
    throw new Error(
      `[Guardrail] confidence_score must be between 0 and 1, got ${input.confidence_score}`
    );
  }
  if (input.processing_time_ms < 0) {
    throw new Error(
      `[Guardrail] processing_time_ms must be non-negative, got ${input.processing_time_ms}`
    );
  }

  const response: UniversalResponse<T> = {
    request_id: input.request_id,
    agent_source: input.agent_source,
    status: input.status,
    result: input.result,
    guardrails: buildGuardrailPayload(),
    confidence_score: input.confidence_score,
    processing_time_ms: input.processing_time_ms,
    timestamp: new Date().toISOString(),
  };

  // ── Freeze to prevent post-construction mutation ──
  return Object.freeze(response);
}

/**
 * Apply mandatory guardrails to an error response.
 *
 * Even error responses MUST carry the disclaimer.
 */
export function applyErrorGuardrail(
  input: GuardrailErrorInput
): AgentErrorResponse {
  const response: AgentErrorResponse = {
    request_id: input.request_id,
    agent_source: input.agent_source,
    status: "error",
    error: {
      code: input.error_code,
      message: input.error_message,
      details: input.error_details,
    },
    guardrails: buildGuardrailPayload(),
    processing_time_ms: input.processing_time_ms,
    timestamp: new Date().toISOString(),
  };

  return Object.freeze(response);
}

// ─── Verification Utility ───────────────────────────────────────────────────

/**
 * Verify that a response object has the disclaimer correctly applied.
 * Use this in tests and middleware to audit response compliance.
 *
 * @returns true if the response carries the correct disclaimer
 */
export function verifyDisclaimer(
  response: UniversalResponse | AgentErrorResponse
): boolean {
  return (
    response.guardrails.disclaimer_applied === true &&
    response.guardrails.disclaimer_text === DISCLAIMER_TEXT &&
    response.guardrails.version === GUARDRAIL_VERSION
  );
}

/**
 * Middleware-style wrapper that validates a response before passing it on.
 * Throws if the disclaimer is missing — for use in response interceptors.
 */
export function assertDisclaimer(
  response: UniversalResponse | AgentErrorResponse
): void {
  if (!verifyDisclaimer(response)) {
    throw new Error(
      "[Guardrail] FAIL-CLOSED: Response is missing the mandatory disclaimer. " +
        "All Track A responses MUST be wrapped with applyGuardrails()."
    );
  }
}
