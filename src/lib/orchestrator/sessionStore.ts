/**
 * ─────────────────────────────────────────────────────────────────────────────
 * sessionStore.ts — In-memory session state for the Orchestrator.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Same pattern as the existing in-memory activeCallStore used elsewhere in
 * the project — no new database dependency.
 *
 * Keeps track of what happened earlier in a conversation so the Orchestrator
 * can, for example, hand a Triage department straight to GeoLocator without
 * asking the user to repeat themselves.
 *
 * LIMITATION: Resets on server restart. Acceptable for a hackathon prototype.
 */

// ─── Session State Interface ────────────────────────────────────────────────

export interface SessionState {
  session_id: string;
  conversation_history: {
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }[];
  last_agent_used: string | null;
  last_triage_department: string | null;
  last_triage_location_preference: "nearest" | "best" | "balanced" | null;
  last_location: { latitude: number; longitude: number } | null;
  consent_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

// ─── In-Memory Store ────────────────────────────────────────────────────────

const sessionStore = new Map<string, SessionState>();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Retrieve an existing session or create a fresh one if it doesn't exist.
 */
export function getOrCreateSession(sessionId: string): SessionState {
  const existing = sessionStore.get(sessionId);
  if (existing) return existing;

  const fresh: SessionState = {
    session_id: sessionId,
    conversation_history: [],
    last_agent_used: null,
    last_triage_department: null,
    last_triage_location_preference: null,
    last_location: null,
    consent_confirmed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  sessionStore.set(sessionId, fresh);
  return fresh;
}

/**
 * Update an existing session with a partial patch.
 * Creates the session if it doesn't exist yet.
 */
export function updateSession(
  sessionId: string,
  patch: Partial<SessionState>
): SessionState {
  const current = getOrCreateSession(sessionId);
  const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
  sessionStore.set(sessionId, updated);
  return updated;
}

/**
 * Append a message to the session's conversation history.
 */
export function appendHistory(
  sessionId: string,
  role: "user" | "assistant",
  content: string
): void {
  const session = getOrCreateSession(sessionId);
  session.conversation_history.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });
  session.updated_at = new Date().toISOString();
}
