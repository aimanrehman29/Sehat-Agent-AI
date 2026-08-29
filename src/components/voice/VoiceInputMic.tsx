/**
 * VoiceInputMic.tsx — Reusable voice recorder UI component.
 *
 * Renders a microphone button with Start/Stop toggle, live recording state,
 * audio playback preview, and a transcript display.
 *
 * Usage:
 *   <VoiceInputMic
 *     onRecordingReady={(r) => setVoicePayload({
 *       audio_base64: r.audioBase64,
 *       audio_mime_type: r.audioMimeType,
 *       transcript_text: r.transcriptText,
 *     })}
 *   />
 */

"use client";

import { useRef } from "react";
import { useVoiceRecorder } from "@/lib/voice/recorder";
import type { VoiceRecording } from "@/lib/voice/recorder";

// ─── Props ────────────────────────────────────────────────────────────────────

interface VoiceInputMicProps {
  /**
   * Called when a recording is finalized (MediaRecorder onstop fires).
   * The parent page should store the payload and merge it into the next
   * agent request.
   */
  onRecordingReady: (recording: VoiceRecording) => void;
  /**
   * Called when the user clears the recording.
   * The parent page should clear its stored voice payload.
   */
  onClear?: () => void;
  /**
   * BCP 47 language tag for Web Speech API transcription.
   * "en-US" (default) | "ur-PK" | "en-US,ur-PK"
   */
  lang?: string;
  /** Accent color class for the recording button (Tailwind). */
  accentClass?: string;
  /** Disabled when an image analysis is in flight. */
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceInputMic({
  onRecordingReady,
  onClear,
  lang = "en-US",
  accentClass = "bg-indigo-600 hover:bg-indigo-700",
  disabled = false,
}: VoiceInputMicProps) {
  const {
    state,
    recording,
    error,
    startRecording,
    stopRecording,
    clearRecording,
  } = useVoiceRecorder(lang);

  function handleClear() {
    clearRecording();
    onClear?.();
  }

  // Bubble finished recording up to parent
  function handleRecordingReady(r: VoiceRecording) {
    onRecordingReady(r);
  }

  // When state transitions to "ready", notify parent once
  const prevReady = useRef(false);
  if (state === "ready" && !prevReady.current && recording) {
    prevReady.current = true;
    handleRecordingReady(recording);
  }
  if (state !== "ready") {
    prevReady.current = false;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 p-4">
      {/* Header label */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎙️</span>
        <p className="text-sm font-semibold text-indigo-800">Voice Input</p>
        <span className="text-xs text-indigo-400 ml-auto">English · اردو</span>
      </div>

      {/* Control row */}
      <div className="flex items-center gap-3">
        {/* Main mic button */}
        {state === "idle" || state === "ready" ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            aria-label="Start recording"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${accentClass}`}
          >
            🎤 Record
          </button>
        ) : state === "recording" ? (
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Stop recording"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors animate-pulse"
          >
            ⏹ Stop
          </button>
        ) : (
          /* processing */
          <button
            type="button"
            disabled
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gray-400 cursor-not-allowed"
          >
            <span className="animate-spin">⏳</span> Processing…
          </button>
        )}

        {/* Live indicator */}
        {state === "recording" && (
          <span className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
            Recording…
          </span>
        )}

        {/* Clear button */}
        {(state === "ready" || recording) && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear recording"
            className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Audio preview + transcript */}
      {recording && state === "ready" && (
        <div className="mt-4 space-y-3">
          {/* Playback */}
          <div>
            <p className="text-xs text-gray-400 mb-1">
              Preview ({(recording.durationMs / 1000).toFixed(1)}s)
            </p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              controls
              src={recording.previewUrl}
              className="w-full h-8 rounded"
            />
          </div>

          {/* Transcript */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">
              Transcript
              {recording.transcriptText ? (
                <span className="ml-1 text-green-500">(browser)</span>
              ) : (
                <span className="ml-1 text-amber-400">(will transcribe on submit)</span>
              )}
            </p>
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 min-h-[2.5rem]">
              {recording.transcriptText ||
                <span className="text-gray-300 text-xs italic">No browser transcript — Whisper will transcribe on the server.</span>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

