/**
 * ─────────────────────────────────────────────────────────────────────────────
 * fallbackAssistant.ts — LLM-based fallback for unmatched intents.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is the "RAG-bot decision, implemented" — but it is NOT true RAG.
 * There is no vector database or knowledge base in this project.
 * It is an honest, small LLM call that:
 *   (a) tries to help with general app questions, and
 *   (b) gracefully declines anything outside scope, with a fixed list of
 *       what the app can actually do.
 *
 * Reuses the `openai` package already installed for Track A's chat handler.
 * Degrades gracefully to a static response if OPENAI_API_KEY is missing.
 */

import OpenAI from "openai";

// ─── Result Interface ───────────────────────────────────────────────────────

export interface FallbackResult {
  /** The generated or static response text */
  summary_text: string;
  /** List of capabilities the user can try */
  suggested_capabilities: string[];
  /** Whether the response came from the LLM or the static fallback */
  source: "llm_fallback" | "static_fallback";
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Honest list of what the app can actually do.
 * Do not inflate or imply capabilities that don't exist.
 */
const APP_CAPABILITIES = [
  "Check if a medicine looks authentic (photo of packaging)",
  "Explain a lab report in plain language (photo/PDF of report)",
  "Read a prescription and set medicine reminders (photo of prescription)",
  "Match your symptoms to the right hospital department",
  "Find the nearest open hospital, with directions",
  "Look up doctors/specialists near you",
  "Detect a medical or mental health emergency and get you help immediately",
];

/**
 * Static fallback message — shown when OPENAI_API_KEY is missing or the
 * LLM call fails. Lists the app's actual capabilities honestly.
 */
const STATIC_FALLBACK =
  "I'm not sure how to help with that directly, but here's what I can do:\n" +
  APP_CAPABILITIES.map((c) => `- ${c}`).join("\n");

// ─── OpenAI Client (lazy singleton) ─────────────────────────────────────────

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (_client) return _client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  _client = new OpenAI({ apiKey });
  return _client;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a fallback response for unmatched intents.
 *
 * Uses the last 6 conversation messages for context.
 * Never throws — degrades to static fallback on any failure.
 *
 * @param text - The user's message
 * @param history - Conversation history for context
 * @returns FallbackResult with either LLM or static content
 */
export async function generateFallbackResponse(
  text: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<FallbackResult> {
  const client = getClient();

  if (!client) {
    return {
      summary_text: STATIC_FALLBACK,
      suggested_capabilities: APP_CAPABILITIES,
      source: "static_fallback",
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are the fallback assistant inside Sehat-Assist AI, a Pakistani healthcare " +
            "navigation app. You do NOT diagnose, prescribe, or give specific medical advice. " +
            "If the user's message is a general app question, answer briefly. If it's a medical " +
            "question outside what the app's specialized agents handle, gently redirect them to " +
            "one of the app's actual capabilities: " +
            APP_CAPABILITIES.join("; ") +
            ". " +
            "Keep responses under 3 sentences.",
        },
        // Last 6 messages for context — enough for continuity, not too much for cost.
        ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: text },
      ],
      max_tokens: 200,
    });

    const reply = completion.choices[0]?.message?.content?.trim();

    return {
      summary_text: reply && reply.length > 0 ? reply : STATIC_FALLBACK,
      suggested_capabilities: APP_CAPABILITIES,
      source: reply ? "llm_fallback" : "static_fallback",
    };
  } catch {
    // Never throw from the fallback path — worst case, degrade to the static list.
    return {
      summary_text: STATIC_FALLBACK,
      suggested_capabilities: APP_CAPABILITIES,
      source: "static_fallback",
    };
  }
}
