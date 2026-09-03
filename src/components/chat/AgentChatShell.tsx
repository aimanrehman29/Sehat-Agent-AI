/**
 * AgentChatShell.tsx — Reusable chat shell for all 7 agent screens.
 *
 * Extracts the chat logic (state, scroll-to-bottom, send handler, consent
 * gate, mic) into one component so all 7 chat screens (6 agents + orchestrator)
 * share it instead of duplicating it.
 *
 * Payload contract (matches the real API routes):
 *   - Direct agents (Track A): session_id, text, media_base64, image_base64
 *     (both media fields are sent; each route reads the one it expects)
 *   - Orchestrator: session_id, text, latitude, longitude, agent_hint
 *     (agent_hint lets the Orchestrator skip classification when the user
 *      tapped a specific tile instead of typing free text)
 *
 * Brand palette:
 *   - Kelly Green (#00ACB1) user bubbles + send button
 *   - Mint (#87E4DB) "Thinking..." state
 *   - G2 (#FAFCFC) shell background
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useConsentGate } from "@/lib/consent/useConsentGate";
import ConsentModal from "@/components/consent/ConsentModal";
import VoiceInputMic from "@/components/voice/VoiceInputMic";
import type { VoiceRecording } from "@/lib/voice/recorder";
import ChatFileUpload from "./ChatFileUpload";
import ResultRenderer from "@/components/results/ResultRenderer";
import type { AgentConfig } from "@/lib/agents/agentConfig";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { UI_STRINGS } from "@/lib/i18n/translations";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Turn {
  type: "user" | "response";
  text?: string;
  fileName?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response?: any;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AgentChatShell({ agent }: { agent: AgentConfig }) {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = UI_STRINGS[lang];
  const micConsent = useConsentGate("microphone");
  const locationConsent = useConsentGate("location");

  const [sessionId] = useState(() => uuidv4());
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [showMic, setShowMic] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const Icon = agent.icon;

  // ── Auto-scroll to bottom on new turns ──
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, isLoading]);

  // ── Send message ──
  async function handleSend(
    text: string,
    file?: { base64: string; name: string; mimeType: string }
  ) {
    if (!text.trim() && !file) return;

    setTurns((t) => [...t, { type: "user", text, fileName: file?.name }]);
    setInputText("");
    setShowMic(false);
    setIsLoading(true);

    try {
      const endpoint =
        agent.endpointMode === "direct"
          ? agent.directEndpoint!
          : "/api/orchestrator";

      // Direct agents (Track A) read media_base64; some consumers expect
      // image_base64 — send both so each route finds the field it wants.
      // Orchestrator is text-only but accepts agent_hint + coordinates.
      const body =
        agent.endpointMode === "direct"
          ? {
              session_id: sessionId,
              text,
              media_base64: file?.base64,
              image_base64: file?.base64,
            }
          : {
              session_id: sessionId,
              text,
              latitude: coords?.latitude,
              longitude: coords?.longitude,
              // Lets the Orchestrator skip classification when the user
              // tapped a specific tile instead of typing free text.
              agent_hint: agent.id,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTurns((t) => [...t, { type: "response", response: data }]);
    } catch {
      setTurns((t) => [
        ...t,
        {
          type: "response",
          response: {
            status: "error",
            error: { message: "Something went wrong. Please try again." },
          },
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Geolocation error — shared by requestLocation and the auto-fire effect ──
  function handleLocationError(err: GeolocationPositionError) {
    console.log(`[Location] getCurrentPosition failed`, { code: err.code, message: err.message });
    setCoords(null);
    setLocationError(
      err.code === err.PERMISSION_DENIED
        ? "Location access is blocked. Check your browser's site settings and allow location, then try again."
        : "Couldn't get your location. Please try again."
    );
  }

  // ── Geolocation request — routed through consent layer ──
  function requestLocation() {
    if (!locationConsent.granted) {
      locationConsent.requestAccess();
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLocationError(null);
      },
      handleLocationError
    );
  }

  // ── Auto-fire geolocation once consent is granted ──
  useEffect(() => {
    if (locationConsent.granted && !coords) {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          setLocationError(null);
        },
        handleLocationError
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationConsent.granted]);

  // ── Voice recording handler ──
  function handleRecordingReady(recording: VoiceRecording) {
    if (recording.transcriptText) {
      setInputText(recording.transcriptText);
      handleSend(recording.transcriptText);
    }
    setShowMic(false);
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-brand-g2">
      {/* ── Header — back button + agent icon + name ── */}
      <header
        className="flex-none bg-white border-b border-brand-g16 px-3 pb-3 flex items-center gap-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <button
          onClick={() => router.push("/")}
          aria-label="Back"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} color="#015D67" />
        </button>
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "#CAF0C1" }}
        >
          <Icon size={16} color="#015D67" />
        </span>
        <h1 className="text-base font-semibold text-brand-forest flex-1">
          {agent.name}
        </h1>
        {agent.endpointMode === "orchestrator" && !coords && (
          <button
            onClick={requestLocation}
            className="text-xs font-medium text-brand-kelly min-h-[44px] px-2"
          >
            {t.shareLocation}
          </button>
        )}
        {locationError && (
          <p className="text-xs text-red-600 mt-1">{locationError}</p>
        )}
      </header>

      {/* ── Scrollable conversation area ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {turns.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-10 gap-4 px-4">
            <Icon size={72} color="#CAF0C1" strokeWidth={1.5} />
            <p
              className="text-sm text-brand-g40 text-center"
              dir={lang === "ur" ? "rtl" : "ltr"}
            >
              {lang === "ur" && agent.taglineUr ? agent.taglineUr : agent.tagline}
            </p>
            {agent.examplePrompts && agent.examplePrompts.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center">
                {(lang === "ur" && agent.examplePromptsUr ? agent.examplePromptsUr : agent.examplePrompts).map(
                  (prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(prompt)}
                      dir={lang === "ur" ? "rtl" : "ltr"}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                      style={{ borderColor: "#015D67", color: "#015D67" }}
                    >
                      {prompt}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        )}
        {turns.map((turn, i) =>
          turn.type === "user" ? (
            <div key={i} className="flex justify-end">
              <div
                className="text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] text-sm"
                style={{ backgroundColor: "#00ACB1" }}
              >
                {turn.fileName && (
                  <p className="text-xs opacity-80 mb-1">📎 {turn.fileName}</p>
                )}
                {turn.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "#CAF0C1" }}
              >
                <Icon size={16} color="#015D67" />
              </span>
              <div className="max-w-[85%]">
                <ResultRenderer response={turn.response} />
              </div>
            </div>
          )
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-brand-g16 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full animate-bounce inline-block" style={{ backgroundColor: "#015D67", animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full animate-bounce inline-block" style={{ backgroundColor: "#015D67", animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full animate-bounce inline-block" style={{ backgroundColor: "#015D67", animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Voice input overlay (shown when mic is active) ── */}
      {showMic && micConsent.granted && (
        <div className="flex-none px-4 pb-2">
          <VoiceInputMic
            onRecordingReady={handleRecordingReady}
            onClear={() => setShowMic(false)}
            accentClass="bg-brand-kelly hover:bg-brand-forest"
            disabled={isLoading}
          />
        </div>
      )}

      {/* Microphone consent modal */}
      <ConsentModal
        feature="microphone"
        open={micConsent.modalOpen}
        onAccept={micConsent.onAccept}
        onDecline={micConsent.onDecline}
      />

      {/* Location consent modal */}
      <ConsentModal
        feature="location"
        open={locationConsent.modalOpen}
        onAccept={locationConsent.onAccept}
        onDecline={locationConsent.onDecline}
      />

      {/* ── Sticky bottom input bar ── */}
      <div
        className="flex-none bg-white border-t border-brand-g16 px-3 pt-2 flex items-center gap-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        {agent.acceptsUpload && (
          <ChatFileUpload
            onFile={(f) => handleSend(inputText || `Sent ${f.name}`, f)}
          />
        )}
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend(inputText)}
          placeholder={lang === "ur" && agent.placeholderUr ? agent.placeholderUr : agent.placeholder}
          dir={lang === "ur" ? "rtl" : "ltr"}
          className="flex-1 min-w-0 border border-brand-g24 rounded-full px-4 min-h-[44px] text-sm"
        />
        {/* Mic toggle button */}
        <button
          onClick={() => {
            if (!micConsent.granted) {
              micConsent.requestAccess();
            } else {
              setShowMic(!showMic);
            }
          }}
          aria-label="Voice input"
          className={`rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center text-lg transition-colors ${
            showMic
              ? "bg-brand-forest text-white"
              : "bg-brand-g8 text-brand-g72 hover:bg-brand-g16"
          }`}
        >
          🎤
        </button>
        {/* Send button */}
        <button
          onClick={() => handleSend(inputText)}
          disabled={isLoading}
          aria-label="Send"
          className="text-white rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
          style={{ backgroundColor: "#00ACB1" }}
        >
          →
        </button>
      </div>
    </div>
  );
}
