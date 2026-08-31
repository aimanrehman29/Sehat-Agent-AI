/**
 * VoiceResponsePlayer.tsx — Auto-dictate & audio output component.
 *
 * Reads the agent's `audio_response.text_to_speak` aloud using the browser's
 * `window.speechSynthesis` API (Web Speech API).
 *
 * Features:
 *   • Auto-play toggle — when enabled, speaks the response immediately on mount
 *     (or when `audioResponse` changes), mimicking macOS Dictation (Ctrl+⇧+D).
 *   • Play / Pause / Replay controls.
 *   • Language-aware voice selection (en-US or ur-PK with fallback).
 *   • Graceful no-op when `speechSynthesis` is unavailable (SSR, older browsers).
 *
 * Props:
 *   audioResponse  — the `audio_response` field from any Track A agent result.
 *   autoPlay       — start speaking as soon as the response is received.
 *   accentClass    — Tailwind color class for the play button.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioResponse } from "@/lib/voice/tts";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlayerState = "idle" | "speaking" | "paused" | "done" | "unsupported";

interface VoiceResponsePlayerProps {
  /** TTS metadata from the agent result. Null/undefined renders nothing. */
  audioResponse: AudioResponse | null | undefined;
  /** Automatically speak on mount / when audioResponse changes. Default: false. */
  autoPlay?: boolean;
  /** Tailwind accent color class for the play button. */
  accentClass?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick the best available voice for the requested language.
 * Falls back progressively: exact BCP47 match → language prefix → any voice.
 */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Exact match first (e.g. "en-US")
  const exact = voices.find((v) => v.lang === lang);
  if (exact) return exact;

  // Language prefix (e.g. "ur" from "ur-PK")
  const prefix = lang.split("-")[0];
  const partial = voices.find((v) => v.lang.startsWith(prefix));
  if (partial) return partial;

  // Absolute fallback: first available voice
  return voices[0] ?? null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceResponsePlayer({
  audioResponse,
  autoPlay = false,
  accentClass = "bg-indigo-600 hover:bg-indigo-700",
}: VoiceResponsePlayerProps) {
  const [state, setState] = useState<PlayerState>("idle");
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(autoPlay);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const hasSpokenRef = useRef<string>(""); // tracks last spoken text to avoid re-triggering

  // Check browser support once
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // ── Core speak function ────────────────────────────────────────────────────
  const speak = useCallback(() => {
    if (!supported || !audioResponse?.text_to_speak) return;

    // Cancel any in-progress utterance
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(audioResponse.text_to_speak);
    utterance.lang = audioResponse.language ?? "en-US";
    utterance.rate = 0.95;  // slightly slower for medical context
    utterance.pitch = 1.0;

    // Try to assign the best voice — voices may load async, so retry once
    const assignVoice = () => {
      const voice = pickVoice(utterance.lang);
      if (voice) utterance.voice = voice;
    };
    assignVoice();
    if (!utterance.voice) {
      // Voices weren't loaded yet — wait for the voiceschanged event
      window.speechSynthesis.onvoiceschanged = () => {
        assignVoice();
        window.speechSynthesis.onvoiceschanged = null;
      };
    }

    utterance.onstart = () => setState("speaking");
    utterance.onpause = () => setState("paused");
    utterance.onresume = () => setState("speaking");
    utterance.onend = () => setState("done");
    utterance.onerror = () => setState("idle");

    utteranceRef.current = utterance;
    setState("speaking");
    window.speechSynthesis.speak(utterance);
  }, [audioResponse, supported]);

  // ── Auto-play when audioResponse arrives and toggle is on ─────────────────
  useEffect(() => {
    if (
      autoPlayEnabled &&
      audioResponse?.text_to_speak &&
      audioResponse.text_to_speak !== hasSpokenRef.current
    ) {
      hasSpokenRef.current = audioResponse.text_to_speak;
      speak();
    }
  }, [audioResponse, autoPlayEnabled, speak]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────────
  function handlePause() {
    window.speechSynthesis.pause();
    setState("paused");
  }

  function handleResume() {
    window.speechSynthesis.resume();
    setState("speaking");
  }

  function handleReplay() {
    hasSpokenRef.current = ""; // allow re-trigger
    speak();
  }

  function handleStop() {
    window.speechSynthesis.cancel();
    setState("idle");
  }

  // Nothing to render if there is no TTS content
  if (!audioResponse?.text_to_speak) return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 mt-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>🔊</span>
          <p className="text-sm font-semibold text-indigo-800">Voice Response</p>
          {state === "speaking" && (
            <span className="flex items-center gap-1 text-xs text-indigo-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse inline-block" />
              Speaking…
            </span>
          )}
          {state === "paused" && (
            <span className="text-xs text-amber-500 font-medium">Paused</span>
          )}
        </div>

        {/* Auto-play toggle */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoPlayEnabled}
            onChange={(e) => setAutoPlayEnabled(e.target.checked)}
            className="w-3.5 h-3.5 accent-indigo-600"
            aria-label="Auto-read response"
          />
          <span className="text-xs text-indigo-500">Auto-read</span>
        </label>
      </div>

      {/* Spoken text preview */}
      <p className="text-sm text-gray-600 leading-relaxed mb-3 border-l-2 border-indigo-300 pl-3 italic">
        {audioResponse.text_to_speak}
      </p>

      {/* Control buttons */}
      <div className="flex items-center gap-2">
        {/* Play / Replay */}
        {(state === "idle" || state === "done") && (
          <button
            type="button"
            onClick={state === "done" ? handleReplay : speak}
            aria-label={state === "done" ? "Replay" : "Play"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors ${accentClass}`}
          >
            {state === "done" ? "↺ Replay" : "▶ Play"}
          </button>
        )}

        {/* Pause while speaking */}
        {state === "speaking" && (
          <button
            type="button"
            onClick={handlePause}
            aria-label="Pause"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 transition-colors"
          >
            ⏸ Pause
          </button>
        )}

        {/* Resume while paused */}
        {state === "paused" && (
          <button
            type="button"
            onClick={handleResume}
            aria-label="Resume"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors ${accentClass}`}
          >
            ▶ Resume
          </button>
        )}

        {/* Stop (visible while speaking or paused) */}
        {(state === "speaking" || state === "paused") && (
          <button
            type="button"
            onClick={handleStop}
            aria-label="Stop"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            ⏹ Stop
          </button>
        )}

        {/* Language badge */}
        <span className="ml-auto text-xs text-indigo-400 font-mono">
          {audioResponse.language}
        </span>
      </div>

      {/* Browser unsupported notice */}
      {!supported && (
        <p className="mt-2 text-xs text-gray-400 italic">
          Voice playback is not supported in this browser.
        </p>
      )}
    </div>
  );
}
