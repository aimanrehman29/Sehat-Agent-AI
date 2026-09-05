/**
 * ─────────────────────────────────────────────────────────────────────────────
 * recorder.ts — Browser audio capture React hook.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Provides `useVoiceRecorder` — a thin React hook that wraps the browser
 * MediaRecorder API.  When the user stops recording, the hook:
 *   1. Assembles the recorded Blob from the data chunks.
 *   2. Optionally runs Web Speech API transcription in the browser
 *      (zero server cost, works offline).
 *   3. Returns both `audioBase64` and `transcriptText` so the caller
 *      can include either or both in the API payload.
 *
 * Browser compatibility:
 *   MediaRecorder is available in all modern browsers (Chrome, Firefox, Edge,
 *   Safari 14.1+).  Web Speech API is Chrome/Edge only; Firefox/Safari will
 *   skip the in-browser transcription and fall back to Whisper on the server.
 *
 * This file is a "use client" module — never import it from server components
 * or API routes.
 */

"use client";

import { useCallback, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecorderState = "idle" | "recording" | "processing" | "ready";

export interface VoiceRecording {
  /** Base64-encoded audio data (no data-URI prefix). */
  audioBase64: string;
  /** MIME type of the blob (e.g. "audio/webm;codecs=opus"). */
  audioMimeType: string;
  /** In-browser Web Speech API transcript (may be empty string). */
  transcriptText: string;
  /** Blob URL for <audio> playback preview. */
  previewUrl: string;
  /** Recording duration in milliseconds. */
  durationMs: number;
}

export interface UseVoiceRecorderReturn {
  state: RecorderState;
  recording: VoiceRecording | null;
  /** Error message if recording or transcription failed. */
  error: string | null;
  /** Start capturing microphone audio. */
  startRecording: () => Promise<void>;
  /** Stop capture and finalize the recording. */
  stopRecording: () => void;
  /** Clear the current recording and reset to idle. */
  clearRecording: () => void;
}

// ─── Web Speech API minimal type declarations ─────────────────────────────────
// The Web Speech API is not included in the "types": ["node"] resolution.
// We declare only the surface we use so no @types package is required.

interface ISpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

interface ISpeechRecognitionResultList {
  readonly length: number;
  readonly resultIndex: number;
  [index: number]: ISpeechRecognitionResult;
}

interface ISpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: ISpeechRecognitionResultList;
}

interface ISpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => ISpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SpeechRecognitionCtor | null;
}

/** Run Web Speech API alongside MediaRecorder for in-browser transcription. */
function runSpeechRecognition(
  lang: string = "en-US",
  onResult: (text: string) => void
): ISpeechRecognition | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const sr = new Ctor();
  sr.lang = lang;
  sr.continuous = true;
  sr.interimResults = false;

  const parts: string[] = [];

  sr.onresult = (event: ISpeechRecognitionEvent) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        parts.push(event.results[i][0].transcript);
      }
    }
  };

  sr.onend = () => {
    onResult(parts.join(" ").trim());
  };

  try {
    sr.start();
  } catch {
    // Silently ignore double-start errors
  }

  return sr;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * React hook that manages microphone recording.
 *
 * @param lang  BCP 47 language tag for the Web Speech API (default: "en-US").
 *              Pass "ur-PK" for Urdu or "ur;en" for bilingual.
 *
 * @example
 * const { state, recording, startRecording, stopRecording, clearRecording } =
 *   useVoiceRecorder("en-US");
 */
export function useVoiceRecorder(lang: string = "en-US"): UseVoiceRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const speechRef = useRef<ISpeechRecognition | null>(null);
  const transcriptRef = useRef<string>("");
  /** Bumped on every startRecording — lets stale onend callbacks no-op. */
  const sessionRef = useRef(0);

  const startRecording = useCallback(async () => {
    setError(null);
    setRecording(null);
    sessionRef.current += 1;
    const session = sessionRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick the best supported MIME type
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      transcriptRef.current = "";
      startTimeRef.current = Date.now();

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.start(200); // collect chunks every 200 ms
      setState("recording");

      // Run parallel Web Speech transcription (best-effort).
      // Race guard: if recognition's onend fires AFTER MediaRecorder's onstop
      // has already snapshotted the (empty) transcript, patch it onto the
      // finalized recording so consumers still receive the text.
      speechRef.current = runSpeechRecognition(lang, (text) => {
        if (sessionRef.current !== session) return; // stale recognition ended
        transcriptRef.current = text;
        setRecording((prev) => (prev && text ? { ...prev, transcriptText: text } : prev));
      });
    } catch (err) {
      // NotAllowedError means the user (or browser settings) blocked the
      // mic — surface an actionable message instead of the raw error text.
      const isPermissionDenied =
        err instanceof DOMException && err.name === "NotAllowedError";
      setError(
        isPermissionDenied
          ? "Microphone is blocked for this site. Check your browser's site settings (tap the icon next to the address bar) and allow microphone access, then try again."
          : err instanceof Error
            ? err.message
            : "Microphone access denied or unavailable."
      );
      setState("idle");
    }
  }, [lang]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;

    setState("processing");

    // Stop Web Speech recognition first
    try {
      speechRef.current?.stop();
    } catch {
      /* ignore */
    }

    const durationMs = Date.now() - startTimeRef.current;

    mr.onstop = async () => {
      // Stop all microphone tracks
      streamRef.current?.getTracks().forEach((t) => t.stop());

      const mimeType = mr.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });

      // Convert Blob → Base64
      const base64 = await blobToBase64(blob);
      const previewUrl = URL.createObjectURL(blob);

      setRecording({
        audioBase64: base64,
        audioMimeType: mimeType,
        transcriptText: transcriptRef.current,
        previewUrl,
        durationMs,
      });

      setState("ready");
    };

    mr.stop();
  }, []);

  const clearRecording = useCallback(() => {
    if (recording?.previewUrl) {
      URL.revokeObjectURL(recording.previewUrl);
    }
    setRecording(null);
    setError(null);
    setState("idle");
    chunksRef.current = [];
    transcriptRef.current = "";
  }, [recording]);

  return { state, recording, error, startRecording, stopRecording, clearRecording };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip "data:<mime>;base64," prefix
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
