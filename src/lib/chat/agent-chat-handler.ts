/**
 * ─────────────────────────────────────────────────────────────────────────────
 * agent-chat-handler.ts — Contextual follow-up chat for Track A agents.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Grounds GPT-4o follow-up answers strictly in the initial analysis result
 * (scanned medicine, parsed prescription, or lab report) so users can ask
 * follow-up questions like "What are the side effects?" or "Explain in Urdu".
 *
 * Strategy:
 *   1. Build a system prompt embedding the serialized analysis result plus a
 *      hard safety fence (assist, never diagnose).
 *   2. Call Gemini (GEMINI_2_KEY) with the conversation history.
 *   3. If GEMINI_2_KEY is missing or the call fails, fall back to OpenAI
 *      gpt-4o (OPENAI_API_KEY).
 *   4. If neither provider is configured or both fail, fall back to a safe
 *      deterministic reply — never throw.
 */

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { logger } from "@/lib/logger";
import type { ChatMessage } from "@/lib/validation/chat.schema";
import type { ChatReplyResult } from "@/types/orchestrator";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Which Track A agent a conversation is anchored to. */
export type ChatAgentTarget = "pharma-check" | "lingo-med" | "care-sync";

export interface AgentChatParams {
  session_id: string;
  agent_target: ChatAgentTarget;
  /** The full analysis result from the previous agent run. */
  initial_context: Record<string, unknown>;
  /** Conversation history (oldest first), including the latest user message. */
  messages: ChatMessage[];
}

// ─── Agent Personas ──────────────────────────────────────────────────────────

const AGENT_PERSONAS: Record<ChatAgentTarget, string> = {
  "pharma-check":
    "You are the assistant for Pharma-Check AI, which verifies medicine " +
    "authenticity via the DRAP registry. The user has just scanned a medicine " +
    "package. Answer questions about the scanned item: its authenticity status, " +
    "DRAP registration, manufacturer, batch/expiry data, and general educational " +
    "information about the drug category when asked.",
  "lingo-med":
    "You are the assistant for Lingo-Med AI, which translates lab reports into " +
    "plain language. The user has just uploaded a lab report. Answer questions " +
    "about the extracted metrics: what each test measures, what the reference " +
    "ranges mean, why a value may be flagged, and general educational context. " +
    "Never tell the user what condition they have.",
  "care-sync":
    "You are the assistant for Care-Sync AI, which parses handwritten " +
    "prescriptions into structured medicine schedules. The user has just parsed " +
    "a prescription. Answer questions about the detected medicines, dosages, " +
    "frequencies, and reminder schedules. Clarify common dosage-timing " +
    "conventions (e.g. '1 tab BD' means one tablet twice daily) when asked.",
};

// ─── Safety Fence ─────────────────────────────────────────────────────────────

const SAFETY_FENCE =
  "You are a medical information assistant for the Sehat-Agent AI platform. " +
  "You assist, you never diagnose. You must follow these rules without exception:\n" +
  "1. Ground every answer strictly in the ANALYSIS RESULT provided below. Do not " +
  "invent medicines, dosages, lab values, or dates that are not present in it.\n" +
  "2. If the answer is not derivable from the ANALYSIS RESULT, say so plainly and " +
  "recommend consulting a doctor or pharmacist.\n" +
  "3. Never give a diagnosis, never prescribe or change medication, never tell the " +
  "user to start or stop a treatment. General educational information is allowed.\n" +
  "4. If the user describes symptoms of a medical emergency, tell them to contact " +
  "local emergency services immediately.\n" +
  "5. Keep replies concise (3-5 short paragraphs maximum), warm, and easy to read.\n" +
  "6. If the user asks you to reply in Urdu, reply in Urdu (Urdu script). " +
  "Otherwise reply in the language of the user's question.";

// ─── Lazy Gemini client (preferred provider) ───────────────────────────────────

/** Gemini model used for follow-up chat replies. */
const GEMINI_CHAT_MODEL = "gemini-3.6-flash";

let _gemini: GoogleGenAI | null | undefined;

function getGeminiClient(): GoogleGenAI | null {
  if (_gemini !== undefined) return _gemini;
  const apiKey = process.env.GEMINI_2_KEY;
  _gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;
  return _gemini;
}

// ─── Lazy OpenAI client (fallback provider) ────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  _openai = new OpenAI({ apiKey });
  return _openai;
}

// ─── System Prompt Builder ───────────────────────────────────────────────────

/**
 * Serialize the initial analysis result and embed it in the system prompt.
 * Large contexts are truncated to keep the prompt within a sane budget.
 */
export function buildSystemPrompt(
  agentTarget: ChatAgentTarget,
  initialContext: Record<string, unknown>
): string {
  const MAX_CONTEXT_CHARS = 6_000;
  let serialized: string;
  try {
    serialized = JSON.stringify(initialContext, null, 2);
  } catch {
    serialized = String(initialContext);
  }
  if (serialized.length > MAX_CONTEXT_CHARS) {
    serialized = `${serialized.slice(0, MAX_CONTEXT_CHARS)}\n... [truncated]`;
  }

  return [
    AGENT_PERSONAS[agentTarget],
    "",
    SAFETY_FENCE,
    "",
    "ANALYSIS RESULT (the only context you may draw facts from):",
    "```json",
    serialized,
    "```",
  ].join("\n");
}

// ─── Offline fallback ────────────────────────────────────────────────────────

function buildOfflineReply(agentTarget: ChatAgentTarget): string {
  const persona =
    agentTarget === "pharma-check"
      ? "medicine scan"
      : agentTarget === "lingo-med"
        ? "lab report analysis"
        : "prescription parsing";
  return (
    `I'm sorry — I can't generate a detailed answer for your ${persona} question ` +
    "right now because the AI reply service is not configured. " +
    "Please try again later, or consult your doctor or pharmacist for specific " +
    "questions about your result. " +
    "Remember: Sehat-Agent AI assists, it never diagnoses."
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Generate a follow-up reply grounded in the initial analysis context.
 *
 * @param params  Session, agent target, initial context, and message history.
 * @param requestId  Request ID for structured logging.
 * @returns ChatReplyResult — always resolves, never rejects.
 */
export async function getChatReply(
  params: AgentChatParams,
  requestId: string
): Promise<ChatReplyResult> {
  const { session_id, agent_target, initial_context, messages } = params;

  // ── Provider chain: Gemini (GEMINI_2_KEY) → OpenAI (OPENAI_API_KEY) → offline ──

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const completion = await gemini.models.generateContent({
        model: GEMINI_CHAT_MODEL,
        contents: messages.map((m) => ({
          // Gemini uses "model" where OpenAI uses "assistant"
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        config: {
          systemInstruction: buildSystemPrompt(agent_target, initial_context),
          temperature: 0.3,
          maxOutputTokens: 600,
        },
      });

      const reply = completion.text?.trim() ?? "";
      if (reply) {
        logger.info("[AgentChat] Reply generated via Gemini", {
          requestId,
          sessionId: session_id,
          agentTarget: agent_target,
          historyLength: messages.length,
          replyChars: reply.length,
        });
        return {
          reply,
          session_id,
          agent_target,
          message_count: messages.length + 1,
        };
      }
      logger.warn("[AgentChat] Empty Gemini completion — falling back to OpenAI", {
        requestId,
        sessionId: session_id,
        agentTarget: agent_target,
      });
    } catch (error) {
      logger.warn("[AgentChat] Gemini call failed — falling back to OpenAI", {
        requestId,
        sessionId: session_id,
        agentTarget: agent_target,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    logger.debug("[AgentChat] GEMINI_2_KEY not set — skipping Gemini path", {
      requestId,
      sessionId: session_id,
      agentTarget: agent_target,
    });
  }

  const openai = getOpenAIClient();
  if (!openai) {
    logger.warn("[AgentChat] OPENAI_API_KEY not set — returning offline reply", {
      requestId,
      sessionId: session_id,
      agentTarget: agent_target,
    });
    return {
      reply: buildOfflineReply(agent_target),
      session_id,
      agent_target,
      message_count: messages.length + 1,
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        { role: "system", content: buildSystemPrompt(agent_target, initial_context) },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!reply) {
      logger.warn("[AgentChat] Empty completion — returning offline reply", {
        requestId,
        sessionId: session_id,
      });
      return {
        reply: buildOfflineReply(agent_target),
        session_id,
        agent_target,
        message_count: messages.length + 1,
      };
    }

    logger.info("[AgentChat] Reply generated", {
      requestId,
      sessionId: session_id,
      agentTarget: agent_target,
      historyLength: messages.length,
      replyChars: reply.length,
    });

    return {
      reply,
      session_id,
      agent_target,
      message_count: messages.length + 1,
    };
  } catch (error) {
    logger.error("[AgentChat] OpenAI call failed — returning offline reply", {
      requestId,
      sessionId: session_id,
      agentTarget: agent_target,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      reply: buildOfflineReply(agent_target),
      session_id,
      agent_target,
      message_count: messages.length + 1,
    };
  }
}
