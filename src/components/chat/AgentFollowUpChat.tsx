/**
 * AgentFollowUpChat.tsx — Contextual follow-up chat with voice support.
 *
 * Renders an interactive chat card below any Track A agent's analysis result.
 * Users can ask follow-up questions about the scanned medicine, parsed
 * prescription, or lab report — by typing or by voice (in-browser Web Speech
 * transcription fills the input field).
 *
 * Features:
 *   • Message thread UI (user vs. agent bubbles, RTL-aware for Urdu replies).
 *   • Quick-suggestion chips for common questions.
 *   • Mic recording button — transcript auto-fills the input.
 *   • Auto-dictation toggle — speaks each assistant reply aloud via
 *     window.speechSynthesis (language-aware: Urdu vs. English).
 *   • In-memory session history (React state only, no DB persistence).
 *
 * Props:
 *   initialContext — the full agent analysis result. Renders null when null.
 *   agentTarget    — which agent the conversation is anchored to.
 *   accentClass    — Tailwind color class for buttons / user bubbles.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceRecorder } from "@/lib/voice/recorder";

// ─── Types ──────────────────────────────────────────────────────────────────

type ChatAgentTarget = "pharma-check" | "lingo-med" | "care-sync";

interface ChatBubble {
  role: "user" | "assistant";
  content: string;
}

interface AgentFollowUpChatProps {
  /** The full analysis result object from the previous agent run. Null renders nothing. */
  initialContext: Record<string, unknown> | null;
  /** Which Track A agent this conversation is anchored to. */
  agentTarget: ChatAgentTarget;
  /** Tailwind accent color class (e.g. "bg-blue-600 hover:bg-blue-700"). */
  accentClass?: string;
  /**
   * BCP 47 language tag for browser voice transcription.
   * Must be a SINGLE valid tag (e.g. "en-US" or "ur-PK") — compound tags
   * like "en-US,ur-PK" break SpeechRecognition.
   */
  lang?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENT_LABELS: Record<ChatAgentTarget, string> = {
  "pharma-check": "Pharma-Check",
  "lingo-med": "Lingo-Med",
  "care-sync": "Care-Sync",
};

const SUGGESTIONS = [
  "What are the side effects?",
  "When should I take this?",
  "Explain in Urdu",
  "Is this safe during pregnancy?",
];

/** Detect Arabic-script (Urdu) characters for RTL rendering + voice selection. */
const URDU_RE = /[\u0600-\u06FF]/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pick the best available speechSynthesis voice for the requested language. */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const exact = voices.find((v) => v.lang === lang);
  if (exact) return exact;
  const prefix = lang.split("-")[0];
  const partial = voices.find((v) => v.lang.startsWith(prefix));
  if (partial) return partial;
  return voices[0] ?? null;
}

/** Generate a session id without requiring a secure context. */
function makeSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentFollowUpChat({
  initialContext,
  agentTarget,
  accentClass = "bg-indigo-600 hover:bg-indigo-700",
  lang = "en-US",
}: AgentFollowUpChatProps) {
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoDictate, setAutoDictate] = useState(false);
  const [disclaimerText, setDisclaimerText] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  /** One session id per mounted conversation (in-memory, no persistence). */
  const sessionIdRef = useRef<string>(makeSessionId());

  /** Voice recording for chat questions (transcript fills the input). */
  const recorder = useVoiceRecorder(lang);

  const threadRef = useRef<HTMLDivElement>(null);
  const lastSpokenRef = useRef<string | null>(null);
  /** Which recording we've applied voice text for (previewUrl + filled flag). */
  const appliedVoiceRef = useRef<{ url: string; filled: boolean } | null>(null);
  const contextRef = useRef<Record<string, unknown> | null>(initialContext);

  // ── Reset the conversation when a NEW analysis result arrives ──
  useEffect(() => {
    if (contextRef.current !== initialContext) {
      contextRef.current = initialContext;
      setMessages([]);
      setInput("");
      setError(null);
      setDisclaimerText(null);
      lastSpokenRef.current = null;
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }, [initialContext]);

  // ── Apply voice transcripts to the input field ──
  // Path A: browser Web Speech transcript available at finalization → fill input.
  // Path B: no browser transcript (Firefox/Safari, or recognition failed) →
  //         fall back to server-side Whisper via /api/track-a/voice/transcribe.
  // Path C: recorder.ts patches a late-arriving transcript after finalization —
  //         whoever fills the input first wins, the loser no-ops.
  const applyTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (appliedVoiceRef.current?.filled) return;
    if (appliedVoiceRef.current) appliedVoiceRef.current.filled = true;
    setInput((prev) => (prev ? `${prev} ${trimmed}`.trim() : trimmed));
  }, []);

  const transcribeOnServer = useCallback(
    async (audioBase64: string, audioMimeType: string) => {
      setTranscribing(true);
      try {
        const res = await fetch("/api/track-a/voice/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_base64: audioBase64,
            audio_mime_type: audioMimeType,
          }),
        });
        const data = await res.json();
        const transcript = (data?.result?.transcript as string | undefined) ?? "";
        applyTranscript(transcript);
      } catch {
        // Whisper unavailable — the user can still type their question.
      } finally {
        setTranscribing(false);
      }
    },
    [applyTranscript]
  );

  useEffect(() => {
    if (recorder.state !== "ready" || !recorder.recording) return;
    const rec = recorder.recording;

    // A new recording just finalized
    if (appliedVoiceRef.current?.url !== rec.previewUrl) {
      appliedVoiceRef.current = { url: rec.previewUrl, filled: false };
      const browserTranscript = rec.transcriptText.trim();
      if (browserTranscript) {
        applyTranscript(browserTranscript);
      } else if (rec.audioBase64) {
        void transcribeOnServer(rec.audioBase64, rec.audioMimeType);
      }
      return;
    }

    // Late transcript patch from recorder.ts (recognition onend fired after onstop)
    if (!appliedVoiceRef.current.filled && rec.transcriptText.trim()) {
      applyTranscript(rec.transcriptText);
    }
  }, [recorder.state, recorder.recording, applyTranscript, transcribeOnServer]);

  // ── Auto-scroll the thread to the latest message ──
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // ── Auto-dictation: speak each new assistant reply ──
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (
      autoDictate &&
      last?.role === "assistant" &&
      lastSpokenRef.current !== last.content
    ) {
      lastSpokenRef.current = last.content;
      speakText(last.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, autoDictate]);

  function speakText(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const isUrdu = URDU_RE.test(text);
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(isUrdu ? "ur-PK" : "en-US");
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = isUrdu ? "ur-PK" : "en-US";
    }
    window.speechSynthesis.speak(utterance);
  }

  // ── Send a follow-up question to /api/track-a/chat ──
  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || !initialContext) return;

    setInput("");
    setError(null);
    const history: ChatBubble[] = [...messages, { role: "user", content: trimmed }];
    setMessages(history);
    setLoading(true);

    try {
      const res = await fetch("/api/track-a/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          agent_target: agentTarget,
          initial_context: initialContext,
          messages: history,
        }),
      });
      const data = await res.json();

      if (!res.ok || data?.status === "error") {
        setError(data?.error?.message || `HTTP ${res.status}`);
        return;
      }

      const reply = data?.result?.reply as string | undefined;
      if (reply) {
        setMessages([...history, { role: "assistant", content: reply }]);
      }
      if (data?.guardrails?.disclaimer_text) {
        setDisclaimerText(data.guardrails.disclaimer_text as string);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // ── Render nothing until an analysis result exists ──
  if (!initialContext) return null;

  const micDisabled = loading || recorder.state === "recording" || recorder.state === "processing";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">💬</span>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Follow-Up Chat
          </h3>
          <p className="text-xs text-gray-400">
            Ask anything about your {AGENT_LABELS[agentTarget]} result — by text or voice
          </p>
        </div>
        <label
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none"
          title="Read assistant replies aloud automatically"
        >
          <input
            type="checkbox"
            checked={autoDictate}
            onChange={(e) => setAutoDictate(e.target.checked)}
            className="accent-indigo-600"
          />
          🔊 Auto-read replies
        </label>
      </div>

      {/* Message thread */}
      <div
        ref={threadRef}
        className="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3 max-h-80 overflow-y-auto"
      >
        {messages.length === 0 && !loading && (
          <p className="text-xs text-gray-400 text-center py-6">
            No messages yet — ask a follow-up question below
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              dir={URDU_RE.test(m.content) ? "rtl" : "ltr"}
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? `${accentClass} text-white rounded-br-sm`
                  : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-xl rounded-bl-sm px-4 py-3 text-sm text-gray-400 flex items-center gap-1.5">
              <span className="animate-bounce inline-block" style={{ animationDelay: "0ms" }}>•</span>
              <span className="animate-bounce inline-block" style={{ animationDelay: "150ms" }}>•</span>
              <span className="animate-bounce inline-block" style={{ animationDelay: "300ms" }}>•</span>
            </div>
          </div>
        )}
      </div>

      {/* Disclaimer (from the last chat response guardrails) */}
      {disclaimerText && (
        <p className="mt-3 text-[11px] leading-relaxed text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚕️ {disclaimerText}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Quick suggestion chips (only before the first message) */}
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => sendMessage(s)}
              disabled={loading}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 mt-4">
        {/* Mic button */}
        {recorder.state === "recording" ? (
          <button
            type="button"
            onClick={recorder.stopRecording}
            aria-label="Stop recording"
            className="flex-shrink-0 w-11 h-11 rounded-full bg-red-600 hover:bg-red-700 text-white text-lg flex items-center justify-center animate-pulse transition-colors"
          >
            ⏹
          </button>
        ) : recorder.state === "processing" ? (
          <button
            type="button"
            disabled
            aria-label="Transcribing"
            className="flex-shrink-0 w-11 h-11 rounded-full bg-gray-300 text-white text-lg flex items-center justify-center cursor-not-allowed"
          >
            ⏳
          </button>
        ) : (
          <button
            type="button"
            onClick={recorder.startRecording}
            disabled={micDisabled}
            aria-label="Record voice question"
            className={`flex-shrink-0 w-11 h-11 rounded-full ${accentClass} text-white text-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            🎤
          </button>
        )}

        {/* Text input */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            recorder.state === "recording"
              ? "Recording… speak now, then press ⏹"
              : recorder.error
                ? "Voice error — type your question instead"
                : "Ask a follow-up question… (Enter to send, Shift+Enter for a new line)"
          }
          className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 min-h-[2.75rem] max-h-32"
        />

        {/* Send button */}
        <button
          type="button"
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className={`flex-shrink-0 px-4 h-11 rounded-lg ${accentClass} text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          Send
        </button>
      </div>

      {/* Recording / transcription hint */}
      {(recorder.state === "recording" ||
        recorder.state === "processing" ||
        transcribing ||
        recorder.error ||
        (recorder.state === "ready" &&
          recorder.recording &&
          !appliedVoiceRef.current?.filled)) && (
        <p className="mt-2 text-xs text-gray-400">
          {recorder.state === "recording"
            ? "🔴 Recording — your speech will be transcribed into the input field when you stop."
            : recorder.state === "processing" || transcribing
              ? "Transcribing your recording…"
              : recorder.error
                ? `${recorder.error} — you can still type your question.`
                : "Couldn't transcribe your recording — please type your question, or set OPENAI_API_KEY to enable server-side transcription."}
        </p>
      )}
    </div>
  );
}
