/**
 * POST /api/track-a/chat
 *
 * Contextual follow-up chat for all Track A agents (Pharma-Check, Lingo-Med,
 * Care-Sync). Accepts the previous analysis result as grounding context plus
 * the conversation history, and returns a GPT-4o reply restricted to that
 * context.
 *
 * Request body (JSON):
 *   {
 *     session_id:     string,  // unique per conversation
 *     agent_target:   "pharma-check" | "lingo-med" | "care-sync",
 *     initial_context: object, // the full analysis result from the agent run
 *     messages: Array<{ role: "user" | "assistant", content: string }>,
 *   }
 *
 * Response (JSON): UniversalResponse envelope with ChatReplyResult payload.
 * Every response includes the mandatory guardrail disclaimer.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatReply } from "@/lib/chat/agent-chat-handler";
import { ChatRequestSchema } from "@/lib/validation/chat.schema";
import { applyGuardrails, applyErrorGuardrail } from "@/lib/guardrails/disclaimer";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const body = await request.json();
    const validated = ChatRequestSchema.parse(body);

    const result = await getChatReply(
      {
        session_id: validated.session_id,
        agent_target: validated.agent_target,
        initial_context: validated.initial_context,
        messages: validated.messages,
      },
      requestId
    );

    const response = applyGuardrails({
      request_id: requestId,
      agent_source: "agent-chat",
      status: "success",
      result,
      confidence_score: 0.85,
      processing_time_ms: Date.now() - startTime,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      applyErrorGuardrail({
        request_id: requestId,
        agent_source: "agent-chat",
        error_code:
          error instanceof z.ZodError ? "INVALID_REQUEST" : "CHAT_ERROR",
        error_message:
          error instanceof z.ZodError
            ? error.errors[0]?.message ?? "Invalid request"
            : error instanceof Error
              ? error.message
              : "Unknown error",
        processing_time_ms: Date.now() - startTime,
      }),
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}
