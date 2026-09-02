/**
 * Sehat-Assist AI — Real Homepage (mobile app shell).
 *
 * This is the single entry point for the Sehat-Assist AI chat interface.
 * Ships as an installable PWA that FEELS like a mobile app:
 *   - Fixed top app bar with logo + brand colors
 *   - Scrollable conversation area (chat bubbles)
 *   - Sticky bottom input bar pinned to viewport (like WhatsApp/ChatGPT)
 *   - Safe-area padding for iPhone notch/home-indicator
 *   - Touch targets ≥ 44×44px everywhere
 *
 * Consent flow:
 *   - Location consent gates the app on first load (needed for hospital search)
 *   - Microphone consent is requested on-demand when voice recording is used
 *
 * Calls POST /api/orchestrator (PDF 3) — text/voice only, no file uploads.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { v4 as uuidv4 } from "uuid";
import { useConsentGate } from "@/lib/consent/useConsentGate";
import ConsentModal from "@/components/consent/ConsentModal";
import VoiceInputMic from "@/components/voice/VoiceInputMic";
import type { VoiceRecording } from "@/lib/voice/recorder";
import ResultRenderer from "@/components/results/ResultRenderer";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Turn {
  type: "user" | "response";
  text?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response?: any;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function HomePage() {
  // ── Consent gates ──
  const locationConsent = useConsentGate("location");
  const micConsent = useConsentGate("microphone");

  // ── Session & state ──
  const [sessionId] = useState(() => uuidv4());
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [showMic, setShowMic] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Auto-scroll to bottom on new turns ──
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  // ── Request location on mount (if consent granted) ──
  useEffect(() => {
    if (locationConsent.granted && !coords) {
      requestLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationConsent.granted]);

  // ── Send message to orchestrator ──
  async function handleSend(text: string) {
    if (!text.trim()) return;

    setTurns((t) => [...t, { type: "user", text }]);
    setInputText("");
    setShowMic(false);
    setIsLoading(true);

    try {
      const res = await fetch("/api/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          text,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        }),
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

  // ── Geolocation request ──
  function requestLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      () => setCoords(null)
    );
  }

  // ── Voice recording handler ──
  function handleRecordingReady(recording: VoiceRecording) {
    if (recording.transcriptText) {
      setInputText(recording.transcriptText);
      handleSend(recording.transcriptText);
    }
    setShowMic(false);
  }

  // ── Location consent gate (shown on first load) ──
  if (!locationConsent.granted) {
    return (
      <ConsentModal
        feature="location"
        open={locationConsent.modalOpen || !locationConsent.granted}
        onAccept={locationConsent.onAccept}
        onDecline={locationConsent.onDecline}
      />
    );
  }

  return (
    // 100dvh (not 100vh) so mobile browser chrome resizing doesn't clip the input bar.
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      {/* ── Fixed top app bar — logo + Forest Green title ── */}
      <header
        className="flex-none bg-white border-b px-4 pb-3 flex items-center gap-2 justify-between"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Sehat-Assist AI"
            width={32}
            height={32}
            priority
          />
          <h1 className="text-base font-semibold text-[#015D47]">
            Sehat-Assist AI
          </h1>
        </div>
        {!coords && (
          <button
            onClick={requestLocation}
            className="text-xs text-[#00AC81] font-medium min-h-[44px] px-2 flex items-center"
          >
            Share location
          </button>
        )}
      </header>

      {/* ── Scrollable conversation area — the ONLY part that scrolls ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {turns.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-8">
            Describe how you feel, or ask a question.
          </p>
        )}
        {turns.map((turn, i) =>
          turn.type === "user" ? (
            <div key={i} className="flex justify-end">
              {/* User chat bubble — Kelly Green */}
              <div className="bg-[#00AC81] text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] text-sm">
                {turn.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[90%]">
                <ResultRenderer response={turn.response} />
              </div>
            </div>
          )
        )}
        {isLoading && (
          <div className="flex justify-start">
            <p className="text-xs text-[#47EAD8] font-medium animate-pulse">
              Thinking...
            </p>
          </div>
        )}
      </div>

      {/* ── Voice input overlay (shown when mic is active) ── */}
      {showMic && micConsent.granted && (
        <div className="flex-none px-4 pb-2">
          <VoiceInputMic
            onRecordingReady={handleRecordingReady}
            onClear={() => setShowMic(false)}
            accentClass="bg-[#00AC81] hover:bg-[#015D47]"
            disabled={isLoading}
          />
        </div>
      )}

      {/* Microphone consent modal (shown when user clicks mic without consent) */}
      <ConsentModal
        feature="microphone"
        open={micConsent.modalOpen}
        onAccept={micConsent.onAccept}
        onDecline={micConsent.onDecline}
      />

      {/* ── Sticky bottom input bar — pinned above the home indicator ── */}
      <div
        className="flex-none bg-white border-t px-3 pt-2 flex items-center gap-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend(inputText)}
          placeholder="e.g. I have chest pain..."
          className="flex-1 border rounded-full px-4 min-h-[44px] text-sm"
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
              ? "bg-[#015D47] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          🎤
        </button>
        {/* Send button — Kelly Green */}
        <button
          onClick={() => handleSend(inputText)}
          disabled={isLoading}
          aria-label="Send"
          className="bg-[#00AC81] text-white rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
        >
          →
        </button>
      </div>
    </div>
  );
}
