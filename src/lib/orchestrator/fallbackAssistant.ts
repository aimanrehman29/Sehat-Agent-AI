/**
 * ─────────────────────────────────────────────────────────────────────────────
 * fallbackAssistant.ts — Gemini-powered fallback for unmatched intents.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is the "RAG-bot decision, implemented" — but it is NOT true RAG.
 * There is no vector database or knowledge base in this project.
 * It is an honest, small LLM call that:
 *   (a) tries to help with general app questions, and
 *   (b) gracefully declines anything outside scope, with a fixed list of
 *       what the app can actually do.
 *
 * Uses the same GEMINI_API_KEY and the same @google/genai SDK pattern already
 * working in doctorLookup.ts. Degrades gracefully to a static response if
 * GEMINI_API_KEY is missing or the call fails.
 */

import { GoogleGenAI } from "@google/genai";
import { logger } from "@/lib/logger";
import {
  QUOTA_EXHAUSTED_MESSAGE,
  isQuotaExhaustedError,
} from "@/agents/track-b/doctorLookup";

// ─── Result Interface ───────────────────────────────────────────────────────

export interface FallbackResult {
  /** The generated or static response text */
  summary_text: string;
  /** List of capabilities the user can try */
  suggested_capabilities: string[];
  /** Whether the response came from Gemini or the static fallback */
  source: "gemini_fallback" | "static_fallback";
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
 * Static fallback message — shown when GEMINI_API_KEY is missing or the
 * Gemini call fails. Lists the app's actual capabilities honestly.
 */
const STATIC_FALLBACK =
  "Here's what I can help with:\n" + APP_CAPABILITIES.map((c) => `- ${c}`).join("\n");

// ─── Gemini Client (lazy singleton) ─────────────────────────────────────────

const FALLBACK_MODEL = "gemini-3.6-flash";

let _gemini: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (_gemini) return _gemini;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _gemini = new GoogleGenAI({ apiKey });
  return _gemini;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are the assistant for Sehat-Agent AI, a Pakistani healthcare navigation app. " +
  "You do NOT diagnose, prescribe, or give specific medical advice. " +
  "If the user asks what the app can do, or a general/greeting question, answer directly and " +
  "warmly in 1-3 short sentences — do NOT say things like 'I'm not sure how to help.' " +
  "If their message is a medical question outside what the app's specialized agents handle, " +
  "gently redirect them toward one of the app's real capabilities: " +
  APP_CAPABILITIES.join("; ") + ". " +
  "Never invent a diagnosis or medical claim. Keep replies under 3 sentences.";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a fallback response for unmatched intents.
 *
 * Uses the last 6 conversation messages for context.
 * Never throws — degrades to static fallback on any failure.
 *
 * @param text - The user's message
 * @param history - Conversation history for context
 * @returns FallbackResult with either Gemini or static content
 */
export async function generateFallbackResponse(
  text: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<FallbackResult> {
  const client = getGeminiClient();

  if (!client) {
    logger.warn("[FallbackAssistant] GEMINI_API_KEY not set — using static fallback");
    return {
      summary_text: STATIC_FALLBACK,
      suggested_capabilities: APP_CAPABILITIES,
      source: "static_fallback",
    };
  }

  try {
    const recentHistory = history
      .slice(-6)
      .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
      .join("\n");

    const prompt = `${SYSTEM_PROMPT}\n\n${recentHistory ? recentHistory + "\n" : ""}User: ${text}`;

    const completion = await client.models.generateContent({
      model: FALLBACK_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.4,
        // Thinking tokens count toward maxOutputTokens — a low cap truncates
        // the reply mid-sentence.
        maxOutputTokens: 1000,
      },
    });

    const reply = (completion.text ?? "").trim();

    logger.info("[FallbackAssistant] Gemini reply generated", {
      replyChars: reply.length,
    });

    return reply.length > 0
      ? {
          summary_text: reply,
          suggested_capabilities: APP_CAPABILITIES,
          source: "gemini_fallback",
        }
      : {
          summary_text: STATIC_FALLBACK,
          suggested_capabilities: APP_CAPABILITIES,
          source: "static_fallback",
        };
  } catch (error) {
    console.error("[FallbackAssistant] Gemini call failed:", error);
    logger.warn("[FallbackAssistant] Gemini call failed — using static fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Honest quota disclosure — same message as doctorLookup.ts.
    if (isQuotaExhaustedError(error)) {
      return {
        summary_text: QUOTA_EXHAUSTED_MESSAGE,
        suggested_capabilities: APP_CAPABILITIES,
        source: "static_fallback",
      };
    }
    return {
      summary_text: STATIC_FALLBACK,
      suggested_capabilities: APP_CAPABILITIES,
      source: "static_fallback",
    };
  }
}
