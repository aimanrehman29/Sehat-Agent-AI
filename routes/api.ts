/**
 * ─────────────────────────────────────────────────────────────────────────────
 * api.ts — HTTP endpoints that trigger each agent.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * REST API router that maps incoming HTTP requests to the orchestrator.
 * These endpoints are used by Track B (Twilio, Voice) and external
 * integrations to invoke Track A agents.
 *
 * Endpoints:
 *   POST /api/v1/agents/pharma-check   — Fake medicine detection
 *   POST /api/v1/agents/lingo-med      — Lab report simplification
 *   POST /api/v1/agents/care-sync      — Prescription parsing
 *   POST /api/v1/agents/triage         — Symptom routing
 *   POST /api/v1/agents/geo-locator    — Hospital lookup
 *   POST /api/v1/agents/auto-booking   — Appointment booking
 *   POST /api/v1/agents/emergency      — Emergency escalation
 *   GET  /api/v1/agents                — List all agents + health check
 */

import type { IncomingMessage, ServerResponse } from "http";
import { orchestrator } from "../agents/orchestrator";
import { logger } from "../utils/logger";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

// ─── Router ─────────────────────────────────────────────────────────────────

export async function apiRouter(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<void> {
  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  // ── GET /api/v1/agents — health check + agent list ──
  if (pathname === "/api/v1/agents" && req.method === "GET") {
    jsonResponse(res, 200, {
      status: "healthy",
      agents: orchestrator.getAgents(),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // ── POST /api/v1/agents/:agentName — route to agent ──
  const match = pathname.match(/^\/api\/v1\/agents\/([a-z-]+)$/);
  if (match && req.method === "POST") {
    const agentName = match[1];
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      jsonResponse(res, 400, { error: "Invalid JSON body" });
      return;
    }

    logger.info(`[API] POST ${pathname}`, { requestId, agentName });
    const result = await orchestrator.route(agentName, requestId, body);
    jsonResponse(res, 200, result);
    return;
  }

  // ── 404 ──
  jsonResponse(res, 404, { error: "Not found" });
}
