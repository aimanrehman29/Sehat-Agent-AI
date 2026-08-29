/**
 * Zod validation schemas for the contextual follow-up chat endpoint.
 * Validates the request body sent to POST /api/track-a/chat.
 */

import { z } from "zod";

// ─── Request Schema ─────────────────────────────────────────────────────────

/** Chat message roles accepted by the follow-up chat endpoint. */
export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1, "Message content must not be empty").max(2000),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  /** Unique session identifier (generated client-side per conversation). */
  session_id: z.string().min(1, "session_id must not be empty").max(128),
  /** Which Track A agent's analysis result anchors this conversation. */
  agent_target: z.enum(["pharma-check", "lingo-med", "care-sync"]),
  /**
   * The full analysis result payload from the previous agent run.
   * Grounds every follow-up reply strictly in this context.
   */
  initial_context: z.record(z.unknown()),
  /** Conversation history (oldest first). At least one user message required. */
  messages: z.array(ChatMessageSchema).min(1, "At least one message is required").max(40),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
