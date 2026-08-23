/**
 * ─────────────────────────────────────────────────────────────────────────────
 * orchestrator.ts — Routes incoming requests to the right agent.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Central dispatcher for the Sehat-Agent AI platform.
 * Receives requests from any channel (voice, chat, web, mobile) and routes
 * them to the appropriate Track A or Track B agent module.
 *
 * Architecture:
 *   Track B (Voice/Twilio/GPS) → Orchestrator → Track A (Vision/OCR agents)
 *
 * Every outgoing response is wrapped through the guardrail disclaimer system
 * — it is architecturally impossible for a response to bypass the mandatory
 * "Assist, not Diagnose" disclaimer.
 */

import { PharmaCheckAgent } from "./pharmaCheck";
import { LingoMedAgent } from "./lingoMed";
import { CareSyncAgent } from "./careSync";
import { TriageAgent } from "./triage";
import { GeoLocatorAgent } from "./geoLocator";
import { AutoBookingAgent } from "./autoBooking";
import { EmergencyEscalationAgent } from "./emergencyEscalation";
import { logger } from "../utils/logger";
import { DISCLAIMER } from "../utils/disclaimers";

// ─── Agent Registry ────────────────────────────────────────────────────────

const AGENTS = {
  "pharma-check": new PharmaCheckAgent(),
  "lingo-med": new LingoMedAgent(),
  "care-sync": new CareSyncAgent(),
  triage: new TriageAgent(),
  "geo-locator": new GeoLocatorAgent(),
  "auto-booking": new AutoBookingAgent(),
  emergency: new EmergencyEscalationAgent(),
} as const;

export type AgentName = keyof typeof AGENTS;

// ─── Orchestrator ───────────────────────────────────────────────────────────

export class Orchestrator {
  /**
   * Route a request to the specified agent and return a guardrail-wrapped
   * response envelope.
   */
  async route(
    agentName: string,
    requestId: string,
    payload: Record<string, unknown>
  ) {
    const start = Date.now();
    logger.info(`[Orchestrator] → ${agentName}`, { requestId });

    const agent = AGENTS[agentName as AgentName];
    if (!agent) {
      logger.error(`[Orchestrator] Unknown agent: ${agentName}`);
      return this.buildError(requestId, "UNKNOWN_AGENT", `No agent: ${agentName}`, start);
    }

    try {
      const result = await agent.execute(payload, requestId);
      return this.buildSuccess(requestId, agentName, result, start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Agent failed";
      logger.error(`[Orchestrator] Agent error: ${agentName}`, { error: msg });
      return this.buildError(requestId, "AGENT_ERROR", msg, start);
    }
  }

  /** List all registered agents */
  getAgents(): AgentName[] {
    return Object.keys(AGENTS) as AgentName[];
  }

  // ── Response Builders (always inject disclaimer) ──

  private buildSuccess(
    requestId: string,
    agent: string,
    result: unknown,
    start: number
  ) {
    return {
      request_id: requestId,
      agent_source: agent,
      status: "success",
      result,
      guardrails: {
        disclaimer_applied: true,
        disclaimer_text: DISCLAIMER,
        version: "1.0.0",
      },
      confidence_score: (result as Record<string, unknown>)?.confidence ?? 0.85,
      processing_time_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }

  private buildError(
    requestId: string,
    code: string,
    message: string,
    start: number
  ) {
    return {
      request_id: requestId,
      status: "error",
      error: { code, message },
      guardrails: {
        disclaimer_applied: true,
        disclaimer_text: DISCLAIMER,
        version: "1.0.0",
      },
      processing_time_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
}

/** Singleton — import and use directly */
export const orchestrator = new Orchestrator();
