/**
 * Orchestrator handoff helpers.
 *
 * These functions transform between the universal orchestrator envelope
 * and the internal agent input types used by each Track A module.
 */

import type {
  UniversalRequest,
  UniversalResponse,
  PharmaCheckResult,
  LingoMedResult,
  CareSyncResult,
} from "@/types/orchestrator";
import type {
  PharmaCheckInput,
  LingoMedInput,
  CareSyncInput,
  AgentExecutionContext,
} from "@/types/agents";
import { applyGuardrails } from "@/lib/guardrails/disclaimer";
import type { AgentId } from "@/config/constants";

// ─── Request Extraction ─────────────────────────────────────────────────────

/**
 * Extract the image buffer from a UniversalRequest payload.
 * Supports both base64 inline data and URL-based media references.
 */
export async function extractMediaBuffer(
  request: UniversalRequest
): Promise<Buffer> {
  if (request.payload.media_base64) {
    return Buffer.from(request.payload.media_base64, "base64");
  }

  if (request.payload.media_url) {
    const response = await fetch(request.payload.media_url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch media from URL: ${response.status} ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error("No media provided in request payload");
}

/**
 * Build an AgentExecutionContext from a UniversalRequest.
 */
export function buildExecutionContext(
  request: UniversalRequest
): AgentExecutionContext {
  return {
    request_id: request.request_id,
    session_id: request.session_id,
    user_id: request.context?.user_profile?.user_id,
    started_at: Date.now(),
  };
}

// ─── Agent-Specific Input Builders ──────────────────────────────────────────

/**
 * Transform a UniversalRequest into PharmaCheckInput.
 */
export async function toPharmaCheckInput(
  request: UniversalRequest
): Promise<PharmaCheckInput> {
  const image_buffer = await extractMediaBuffer(request);
  return {
    image_buffer,
    image_mime_type: request.payload.media_type,
    user_query: request.context?.conversation_history?.slice(-1)[0]?.content,
  };
}

/**
 * Transform a UniversalRequest into LingoMedInput.
 */
export async function toLingoMedInput(
  request: UniversalRequest
): Promise<LingoMedInput> {
  const image_buffer = await extractMediaBuffer(request);
  return {
    image_buffer,
    image_mime_type: request.payload.media_type,
    user_query: request.context?.conversation_history?.slice(-1)[0]?.content,
  };
}

/**
 * Transform a UniversalRequest into CareSyncInput.
 */
export async function toCareSyncInput(
  request: UniversalRequest
): Promise<CareSyncInput> {
  const image_buffer = await extractMediaBuffer(request);
  return {
    image_buffer,
    image_mime_type: request.payload.media_type,
    user_query: request.context?.conversation_history?.slice(-1)[0]?.content,
  };
}

// ─── Response Builders ──────────────────────────────────────────────────────

/**
 * Build a fully-formed UniversalResponse for Pharma-Check.
 * Automatically applies the disclaimer guardrail.
 */
export function buildPharmaCheckResponse(
  request_id: string,
  result: PharmaCheckResult,
  confidence_score: number,
  processing_time_ms: number
): UniversalResponse<PharmaCheckResult> {
  return applyGuardrails({
    request_id,
    agent_source: "pharma-check" as AgentId,
    status: "success",
    result,
    confidence_score,
    processing_time_ms,
  });
}

/**
 * Build a fully-formed UniversalResponse for Lingo-Med.
 */
export function buildLingoMedResponse(
  request_id: string,
  result: LingoMedResult,
  confidence_score: number,
  processing_time_ms: number
): UniversalResponse<LingoMedResult> {
  return applyGuardrails({
    request_id,
    agent_source: "lingo-med" as AgentId,
    status: "success",
    result,
    confidence_score,
    processing_time_ms,
  });
}

/**
 * Build a fully-formed UniversalResponse for Care-Sync.
 */
export function buildCareSyncResponse(
  request_id: string,
  result: CareSyncResult,
  confidence_score: number,
  processing_time_ms: number
): UniversalResponse<CareSyncResult> {
  return applyGuardrails({
    request_id,
    agent_source: "care-sync" as AgentId,
    status: "success",
    result,
    confidence_score,
    processing_time_ms,
  });
}

// ─── Agent Router ───────────────────────────────────────────────────────────

/**
 * Route an incoming UniversalRequest to the correct agent module.
 * Returns the agent identifier for downstream routing.
 *
 * In the full implementation, this will dynamically import and invoke
 * the correct agent. For now, it validates the target agent.
 */
export function resolveAgentTarget(
  agent_target: string
): AgentId | null {
  const validTargets: Record<string, AgentId> = {
    "pharma-check": "pharma-check" as AgentId,
    "lingo-med": "lingo-med" as AgentId,
    "care-sync": "care-sync" as AgentId,
  };

  return validTargets[agent_target] ?? null;
}
