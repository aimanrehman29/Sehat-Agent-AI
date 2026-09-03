/**
 * Pharma-Check AI — Test Page
 * Upload medicine packaging images, view barcode extraction & risk assessment.
 */

"use client";

import { useState, useRef } from "react";
import VoiceInputMic from "@/components/voice/VoiceInputMic";
import VoiceResponsePlayer from "@/components/voice/VoiceResponsePlayer";
import AgentFollowUpChat from "@/components/chat/AgentFollowUpChat";
import type { VoiceRecording } from "@/lib/voice/recorder";
import type { AudioResponse } from "@/lib/voice/tts";
import {
  requestNotificationPermission,
  scheduleMedicineReminders,
} from "@/lib/notifications/medicineReminder";

export default function PharmaCheckTestPage() {
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
  const [browserNotifStatus, setBrowserNotifStatus] = useState<string | null>(null);
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
      const res = await fetch("/api/track-a/pharma-check", {
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

      if (!res.ok) {
        setError(data.error?.message || `HTTP ${res.status}`);
      } else {
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
  const risk = r?.risk as Record<string, unknown> | undefined;
  const drug = r?.drug_info as Record<string, unknown> | undefined;

  const authStatus = r?.authenticity_status as string | undefined;
  const authColors: Record<string, string> = {
    VERIFIED: "bg-green-100 text-green-800 border-green-300",
    WARNING: "bg-yellow-100 text-yellow-800 border-yellow-300",
    "COULD NOT BE VERIFIED": "bg-red-100 text-red-800 border-red-300",
  };

  const riskColors: Record<string, string> = {
    SAFE: "bg-green-100 text-green-800 border-green-300",
    LOW_RISK: "bg-blue-100 text-blue-800 border-blue-300",
    MEDIUM_RISK: "bg-yellow-100 text-yellow-800 border-yellow-300",
    HIGH_RISK: "bg-orange-100 text-orange-800 border-orange-300",
    CRITICAL: "bg-red-100 text-red-800 border-red-300",
  };

  const S = (v: unknown): string => (v == null ? "" : String(v));

  async function activateBrowserNotifications() {
    setBrowserNotifStatus("requesting...");
    const permission = await requestNotificationPermission();

    if (permission !== "granted") {
      setBrowserNotifStatus(`Permission ${permission}. Enable notifications in browser settings.`);
      return;
    }

    const brandName = S(r?.brand_name) || S(r?.scanned_item) || "Medicine";
    const strength = S(r?.strength) || "as prescribed";

    const added = scheduleMedicineReminders([{
      medicine_name: brandName,
      dosage: strength,
      scheduled_times: ["08:00", "20:00"],
      times_per_day: 2,
    }]);

    setBrowserNotifStatus(
      added.length > 0
        ? `✅ Browser reminder set for ${brandName}! Notifications will fire at scheduled times.`
        : "Reminder already set for this medicine."
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">🔬</span>
          <h1 className="text-2xl font-bold text-gray-900">Pharma-Check AI</h1>
        </div>
        <p className="text-gray-500 text-sm ml-12">
          Upload a photo of medicine packaging to verify authenticity via barcode, QR code, and DRAP lookup.
        </p>
      </div>

      {/* Upload Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {preview ? (
              <img
                src={preview}
                alt="Upload preview"
                className="max-h-48 mx-auto rounded-lg shadow-sm"
              />
            ) : (
              <div>
                <p className="text-4xl mb-3">📷</p>
                <p className="text-sm font-medium text-gray-700">
                  Click to upload or drag & drop
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  JPG, PNG, or WebP — any medicine packaging photo
                </p>
              </div>
            )}
          </div>
          {file && (
            <p className="text-xs text-gray-400 mt-2 text-center">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
          )}

          {/* Voice Input */}
          <div className="mt-4">
            <VoiceInputMic
              accentClass="bg-blue-600 hover:bg-blue-700"
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
            className="w-full mt-4 py-3 px-4 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> Analyzing...
              </span>
            ) : (
              "Analyze Medicine"
            )}
          </button>
        </div>

        {/* Quick Summary Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Result Summary
          </h3>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {result && r && (
            <div className="space-y-3">
              {/* DRAP Authenticity Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Authenticity</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${authColors[authStatus || ""] || "bg-gray-100 text-gray-600"}`}>
                  {authStatus || "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Scanned Item</span>
                <span className="text-sm font-semibold">{(r.scanned_item as string) || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Risk Level</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${riskColors[(risk?.level as string) || ""] || "bg-gray-100 text-gray-600"}`}>
                  {(risk?.level as string) || "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Risk Score</span>
                <span className="text-sm font-semibold">{(risk?.score as number) ?? "—"}/100</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Drug Found</span>
                <span className="text-sm font-semibold">{r.drug_found ? "✅ Yes" : "❌ No"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">DRAP #</span>
                <code className="text-xs">{String((r.drap_number as string) || (r.drap_registration_no as string) || "Not found")}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Confidence</span>
                <span className="text-sm font-semibold">{((result.confidence_score as number) * 100).toFixed(0)}%</span>
              </div>
              {/* Reasoning & Action */}
              {!!r.reasoning && (
                <div className="bg-blue-50 rounded-lg p-3 mt-2">
                  <p className="text-xs font-medium text-blue-500 mb-1">Analysis</p>
                  <p className="text-sm text-blue-800">{String(r.reasoning)}</p>
                </div>
              )}
              {!!r.recommended_action && (
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-500 mb-1">Recommended Action</p>
                  <p className="text-sm text-amber-800 font-medium">{String(r.recommended_action)}</p>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
                <span>Processing time</span>
                <span>{elapsed}ms</span>
              </div>
            </div>
          )}
          {!result && !error && !loading && (
            <p className="text-gray-400 text-sm text-center py-8">Upload an image and click Analyze to see results</p>
          )}
        </div>
      </div>

      {/* Drug Details */}
      {drug && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Drug Registry Info</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoCard label="Drug Name" value={drug.drug_name as string} />
            <InfoCard label="Manufacturer" value={drug.manufacturer as string} />
            <InfoCard label="Category" value={drug.category as string} />
            <InfoCard label="Reg #" value={drug.registration_no as string} />
            <InfoCard label="Batch" value={(drug.batch_number as string) || "—"} />
            <InfoCard label="Expiry" value={(drug.expiry_date as string) || "—"} />
            <InfoCard label="Active" value={drug.is_active ? "✅ Yes" : "❌ No"} />
          </div>
        </div>
      )}

      {/* High-Risk Controlled Drug Warning */}
      {!!r?.has_high_risk_flag && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5 mb-6">
          <p className="text-sm font-bold text-red-800 mb-1">🚨 HIGH RISK — CONTROLLED SUBSTANCE DETECTED</p>
          <p className="text-xs text-red-700">This medicine is a controlled substance. Strict doctor supervision and local hospital verification are required.</p>
          <p className="text-xs text-red-700 mt-2 font-medium" dir="rtl">🚨 اعلیٰ خطرہ — کنٹرول شدہ دوا پائی گئی۔ سخت ڈاکٹر کی نگرانی اور قریبی ہسپتال سے تصدیق ضروری ہے۔</p>
        </div>
      )}

      {/* Bilingual Summaries */}
      {result && r && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {!!r.summary_en && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
              <p className="text-xs font-medium text-blue-500 mb-1">English Summary</p>
              <p className="text-sm text-blue-800 leading-relaxed">{S(r.summary_en)}</p>
            </div>
          )}
          {!!r.summary_ur && (
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5" dir="rtl">
              <p className="text-xs font-medium text-emerald-500 mb-1 text-right">اردو خلاصہ</p>
              <p className="text-sm text-emerald-800 leading-relaxed text-right font-medium" style={{ fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif" }}>
                {S(r.summary_ur)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Browser Notification Reminder Button */}
      {result && r && S(r.scanned_item) !== "No image" && S(r.scanned_item) !== "Analysis failed" && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wider">
                🔔 Medicine Reminder
              </h3>
              <p className="text-xs text-blue-600 mt-1">
                Set a web notification reminder for {S(r.brand_name) || S(r.scanned_item) || "this medicine"}.
              </p>
              <p className="text-xs text-blue-600 mt-0.5" dir="rtl">
                دوائی کے لیے ریمائنڈر لگائیں
              </p>
            </div>
            <button
              onClick={activateBrowserNotifications}
              className="px-5 py-2.5 rounded-lg font-medium text-sm transition-colors bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            >
              🔔 Set Medicine Reminder
            </button>
          </div>
          {browserNotifStatus && (
            <div className={`mt-3 rounded-lg p-3 text-sm ${
              browserNotifStatus.startsWith("✅")
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-amber-50 border border-amber-200 text-amber-700"
            }`}>
              <p className="font-medium">{browserNotifStatus}</p>
            </div>
          )}
        </div>
      )}

      {/* Voice Response Player */}
      {audioResponse && (
        <VoiceResponsePlayer
          audioResponse={audioResponse}
          autoPlay={false}
          accentClass="bg-blue-600 hover:bg-blue-700"
        />
      )}

      {/* Contextual Follow-Up Chat */}
      <AgentFollowUpChat
        initialContext={result}
        agentTarget="pharma-check"
        accentClass="bg-blue-600 hover:bg-blue-700"
      />

      {/* Disclaimer banner */}
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
          <summary className="text-sm text-gray-300 cursor-pointer hover:text-white">
            Full JSON Response
          </summary>
          <pre className="mt-4 text-xs text-green-400 overflow-auto max-h-96">
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-800 truncate">{value}</p>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
