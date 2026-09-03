/**
 * Lingo-Med AI — Test Page
 * Upload lab reports, view extracted metrics, flagged values & plain-language explanations.
 */

"use client";

import { useState, useRef } from "react";
import VoiceInputMic from "@/components/voice/VoiceInputMic";
import VoiceResponsePlayer from "@/components/voice/VoiceResponsePlayer";
import AgentFollowUpChat from "@/components/chat/AgentFollowUpChat";
import type { VoiceRecording } from "@/lib/voice/recorder";
import type { AudioResponse } from "@/lib/voice/tts";

export default function LingoMedTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);
  const [voicePayload, setVoicePayload] = useState<{
    audio_base64: string;
    audio_mime_type: string;
    transcript_text: string;
  } | null>(null);
  const [audioResponse, setAudioResponse] = useState<AudioResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const t0 = performance.now();

    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/track-a/lingo-med", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_base64: base64,
          media_type: file.type,
          ...(voicePayload && { voice_payload: voicePayload }),
        }),
      });
      const data = await res.json();
      setElapsed(Math.round(performance.now() - t0));
      if (!res.ok) setError(data.error?.message || `HTTP ${res.status}`);
      else {
        setResult(data);
        setAudioResponse(
          (data?.result as Record<string, unknown>)?.audio_response as AudioResponse ?? null
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setElapsed(Math.round(performance.now() - t0));
    } finally {
      setLoading(false);
    }
  }

  const r = result?.result as Record<string, unknown> | undefined;
  const metrics = (r?.metrics || []) as Record<string, unknown>[];
  const flagged = (r?.flagged_metrics || []) as Record<string, unknown>[];
  const explanations = (r?.explanations || []) as Record<string, unknown>[];
  const patient = r?.patient_info as Record<string, unknown> | undefined;

  const S = (v: unknown): string => (v == null ? "" : String(v));
  const N = (v: unknown): number => (typeof v === "number" ? v : 0);

  const sevColors: Record<string, string> = {
    NORMAL: "bg-green-100 text-green-700",
    BORDERLINE: "bg-yellow-100 text-yellow-700",
    ABNORMAL: "bg-red-100 text-red-700",
    CRITICAL: "bg-red-200 text-red-800",
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">📋</span>
          <h1 className="text-2xl font-bold text-gray-900">Lingo-Med AI</h1>
        </div>
        <p className="text-gray-500 text-sm ml-12">
          Upload a lab report image or PDF to get simplified explanations of your results.
        </p>
      </div>

      {/* Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {preview ? (
              <img src={preview} alt="Report preview" className="max-h-48 mx-auto rounded-lg shadow-sm" />
            ) : (
              <div>
                <p className="text-4xl mb-3">🧾</p>
                <p className="text-sm font-medium text-gray-700">Upload lab report</p>
                <p className="text-xs text-gray-400 mt-1">Image or PDF — any standard lab report</p>
              </div>
            )}
          </div>
          {file && <p className="text-xs text-gray-400 mt-2 text-center">{file.name}</p>}

          {/* Voice Input */}
          <div className="mt-4">
            <VoiceInputMic
              accentClass="bg-green-600 hover:bg-green-700"
              disabled={loading}
              onRecordingReady={(r: VoiceRecording) =>
                setVoicePayload({
                  audio_base64: r.audioBase64,
                  audio_mime_type: r.audioMimeType,
                  transcript_text: r.transcriptText,
                })
              }
              onClear={() => setVoicePayload(null)}
            />
          </div>

          <button
            onClick={analyze}
            disabled={!file || loading}
            className="w-full mt-4 py-3 px-4 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-600 text-white hover:bg-green-700"
          >
            {loading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin">⏳</span> Analyzing report...</span> : "Analyze Report"}
          </button>
        </div>

        {/* Patient Info + Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Report Summary</h3>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>}
          {result && r && (
            <div className="space-y-4">
              {patient && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {S(patient.name) && <span className="text-gray-600">Patient: <strong>{S(patient.name)}</strong></span>}
                  {N(patient.age) > 0 && <span className="text-gray-600">Age: <strong>{N(patient.age)}</strong></span>}
                  {S(patient.gender) && <span className="text-gray-600">Gender: <strong>{S(patient.gender)}</strong></span>}
                  {S(patient.lab_name) && <span className="text-gray-600">Lab: <strong>{S(patient.lab_name)}</strong></span>}
                </div>
              )}
              <div className="flex gap-4">
                <StatPill label="Total Metrics" value={metrics.length} color="bg-blue-50 text-blue-700" />
                <StatPill label="Flagged" value={flagged.length} color="bg-red-50 text-red-700" />
                <StatPill label="Confidence" value={`${((result.confidence_score as number) * 100).toFixed(0)}%`} color="bg-green-50 text-green-700" />
              </div>
              {/* High-Risk Warning Banner */}
              {!!r.has_high_risk_flag && (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                  <p className="text-sm font-bold text-red-800 mb-1">🚨 HIGH RISK — CRITICAL VALUES DETECTED</p>
                  <p className="text-xs text-red-700">Some lab values are critically outside normal range. Please contact your doctor immediately.</p>
                  <p className="text-xs text-red-700 mt-1 font-medium" dir="rtl">🚨 اعلیٰ خطرہ — کچھ لیબ قدریں خطرناک حد تک معمول سے باہر ہیں۔ براہ کرم فوری طور پر اپنے ڈاکٹر سے رابطہ کریں۔</p>
                </div>
              )}
              {/* Bilingual Summaries */}
              {!!r.summary_en && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs font-medium text-blue-500 mb-1">English Summary</p>
                  <p className="text-sm text-blue-800 leading-relaxed">{S(r.summary_en)}</p>
                </div>
              )}
              {!!r.summary_ur && (
                <div className="bg-emerald-50 rounded-lg p-4" dir="rtl">
                  <p className="text-xs font-medium text-emerald-500 mb-1 text-right">اردو خلاصہ</p>
                  <p className="text-sm text-emerald-800 leading-relaxed text-right font-medium" style={{ fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif" }}>
                    {S(r.summary_ur)}
                  </p>
                </div>
              )}
              {/* Fallback legacy summary */}
              {!r.summary_en && !r.summary_ur && !!r.summary && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-800 leading-relaxed">{S(r.summary)}</p>
                </div>
              )}
              <p className="text-xs text-gray-400">Processed in {elapsed}ms</p>
            </div>
          )}
          {!result && !error && !loading && <p className="text-gray-400 text-sm text-center py-8">Upload a lab report to see results</p>}
        </div>
      </div>

      {/* Metrics Table */}
      {metrics.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Lab Metrics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-2 text-gray-500 font-medium">Test</th>
                  <th className="pb-2 text-gray-500 font-medium">Value</th>
                  <th className="pb-2 text-gray-500 font-medium">Range</th>
                  <th className="pb-2 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2.5 font-medium text-gray-800">{m.test_name as string}</td>
                    <td className="py-2.5">
                      <span className="font-semibold">{m.value as number}</span>
                      <span className="text-gray-400 ml-1">{m.unit as string}</span>
                    </td>
                    <td className="py-2.5 text-gray-500">
                      {m.reference_low != null && m.reference_high != null
                        ? `${m.reference_low} – ${m.reference_high}`
                        : m.reference_high != null
                          ? `< ${m.reference_high}`
                          : m.reference_low != null
                            ? `> ${m.reference_low}`
                            : "—"}
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sevColors[(m.severity as string) || ""] || ""}`}>
                        {m.severity as string}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Explanations */}
      {explanations.length > 0 && (
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Explanations</h3>
          {explanations.map((exp, i) => (
            <div key={i} className={`rounded-xl border p-5 ${
              (exp.severity as string) === "ABNORMAL" || (exp.severity as string) === "CRITICAL"
                ? "bg-red-50 border-red-200"
                : "bg-yellow-50 border-yellow-200"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold text-gray-900">{exp.test_name as string}</h4>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sevColors[(exp.severity as string) || ""] || ""}`}>
                  {exp.severity as string}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed mb-3">{exp.explanation as string}</p>
              <div className="bg-white/70 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Suggestion</p>
                <p className="text-sm text-gray-700">{exp.suggestion as string}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Voice Response Player */}
      {audioResponse && (
        <VoiceResponsePlayer
          audioResponse={audioResponse}
          autoPlay={false}
          accentClass="bg-green-600 hover:bg-green-700"
        />
      )}

      {/* Contextual Follow-Up Chat */}
      <AgentFollowUpChat
        initialContext={result}
        agentTarget="lingo-med"
        accentClass="bg-green-600 hover:bg-green-700"
      />

      {/* Disclaimer */}
      {result && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong>⚕️ {(result?.guardrails as Record<string, unknown>)?.disclaimer_text as string}</strong>
          </p>
        </div>
      )}

      {/* Full JSON */}
      {result && (
        <details className="bg-gray-900 rounded-xl p-4">
          <summary className="text-sm text-gray-300 cursor-pointer hover:text-white">Full JSON Response</summary>
          <pre className="mt-4 text-xs text-green-400 overflow-auto max-h-96">{JSON.stringify(result, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`px-3 py-2 rounded-lg ${color}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
