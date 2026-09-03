/**
 * Care-Sync AI — Test Page
 * Upload prescriptions, view parsed medicines, dosages & reminder schedules.
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

export default function CareSyncTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderResult, setReminderResult] = useState<Record<string, unknown> | null>(null);
  const [browserNotifStatus, setBrowserNotifStatus] = useState<string | null>(null);
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
    setReminderResult(null);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const t0 = performance.now();

    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/track-a/care-sync/parse", {
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
  const medicines = (r?.medicines || []) as Record<string, unknown>[];
  const reminders = (r?.reminders || []) as Record<string, unknown>[];
  const doctor = r?.doctor_info as Record<string, unknown> | undefined;
  const prescriptionId = (r?.prescription_id as string) || null;

  const S = (v: unknown): string => (v == null ? "" : String(v));

  async function activateReminders() {
    if (!reminders.length || !prescriptionId) return;
    setReminderLoading(true);
    setReminderResult(null);

    try {
      const medicinesPayload = reminders
        .filter((rem) => ((rem.cron_expressions as string[]) || []).length > 0)
        .map((rem) => ({
          medicine_name: rem.medicine_name as string,
          cron_expressions: rem.cron_expressions as string[],
          timezone: "Asia/Karachi",
          channel: "push" as const,
        }));

      if (medicinesPayload.length === 0) {
        setReminderResult({ success: false, message: "No medicines with scheduled reminders found." });
        return;
      }

      const res = await fetch("/api/track-a/care-sync/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "test-user",
          prescription_id: prescriptionId,
          medicines: medicinesPayload,
        }),
      });

      const data = await res.json();
      setReminderResult(data as Record<string, unknown>);
    } catch (e) {
      setReminderResult({
        success: false,
        message: e instanceof Error ? e.message : "Failed to activate reminders",
      });
    } finally {
      setReminderLoading(false);
    }
  }

  async function activateBrowserNotifications() {
    setBrowserNotifStatus("requesting...");
    const permission = await requestNotificationPermission();

    if (permission !== "granted") {
      setBrowserNotifStatus(`Permission ${permission}. Enable notifications in browser settings.`);
      return;
    }

    // Build reminder payload from medicines
    const medList = medicines.map((med) => ({
      medicine_name: S(med.name),
      dosage: S(med.dosage) || "as prescribed",
      scheduled_times: (med.scheduled_times as string[]) || [],
      times_per_day: (med.times_per_day as number) || 0,
    }));

    // Also use scheduled_times from reminders if medicines don't have them
    if (medList.every((m) => m.scheduled_times.length === 0)) {
      const reminderTimes = reminders.map((rem) => ({
        medicine_name: S(rem.medicine_name),
        dosage: "as prescribed",
        scheduled_times: extractTimesFromCrons((rem.cron_expressions as string[]) || []),
        times_per_day: ((rem.cron_expressions as string[]) || []).length,
      }));
      const added = scheduleMedicineReminders(reminderTimes);
      setBrowserNotifStatus(
        added.length > 0
          ? `✅ ${added.length} browser reminder${added.length > 1 ? "s" : ""} set! Notifications will fire at scheduled times.`
          : "No schedulable medicines found."
      );
    } else {
      const added = scheduleMedicineReminders(medList);
      setBrowserNotifStatus(
        added.length > 0
          ? `✅ ${added.length} browser reminder${added.length > 1 ? "s" : ""} set! Notifications will fire at scheduled times.`
          : "No schedulable medicines found."
      );
    }
  }

  const formIcons: Record<string, string> = {
    tablet: "💊",
    capsule: "💊",
    syrup: "🧴",
    injection: "💉",
    cream: "🧴",
    drops: "💧",
    inhaler: "🫁",
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">💊</span>
          <h1 className="text-2xl font-bold text-gray-900">Care-Sync AI</h1>
        </div>
        <p className="text-gray-500 text-sm ml-12">
          Upload a doctor&apos;s prescription (parchi) to extract medicines, dosages, and set up reminders.
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
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-colors"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {preview ? (
              <img src={preview} alt="Prescription preview" className="max-h-48 mx-auto rounded-lg shadow-sm" />
            ) : (
              <div>
                <p className="text-4xl mb-3">📝</p>
                <p className="text-sm font-medium text-gray-700">Upload prescription</p>
                <p className="text-xs text-gray-400 mt-1">Photo of a doctor&apos;s prescription (parchi)</p>
              </div>
            )}
          </div>
          {file && <p className="text-xs text-gray-400 mt-2 text-center">{file.name}</p>}

          {/* Voice Input */}
          <div className="mt-4">
            <VoiceInputMic
              accentClass="bg-purple-600 hover:bg-purple-700"
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
            className="w-full mt-4 py-3 px-4 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-purple-600 text-white hover:bg-purple-700"
          >
            {loading ? <span className="flex items-center justify-center gap-2"><span className="animate-spin">⏳</span> Parsing prescription...</span> : "Parse Prescription"}
          </button>
        </div>

        {/* Doctor + Stats */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Prescription Info</h3>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>}
          {result && r && (
            <div className="space-y-4">
              {doctor && (
                <div className="bg-purple-50 rounded-lg p-4 space-y-1">
                  {S(doctor.name) && <p className="text-sm text-purple-800 font-semibold">{S(doctor.name)}</p>}
                  {S(doctor.clinic) && <p className="text-xs text-purple-600">{S(doctor.clinic)}</p>}
                  <div className="flex gap-4 mt-2 text-xs text-purple-500">
                    {S(doctor.date) && <span>Date: {S(doctor.date)}</span>}
                    {S(doctor.registration_no) && <span>Reg: {S(doctor.registration_no)}</span>}
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <div className="bg-purple-50 text-purple-700 px-3 py-2 rounded-lg">
                  <p className="text-xs opacity-70">Medicines</p>
                  <p className="text-lg font-bold">{medicines.length}</p>
                </div>
                <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg">
                  <p className="text-xs opacity-70">Reminders</p>
                  <p className="text-lg font-bold">{reminders.filter(rm => ((rm.cron_expressions as string[]) || []).length > 0).length}</p>
                </div>
                <div className="bg-green-50 text-green-700 px-3 py-2 rounded-lg">
                  <p className="text-xs opacity-70">Confidence</p>
                  <p className="text-lg font-bold">{((result.confidence_score as number) * 100).toFixed(0)}%</p>
                </div>
              </div>
              <p className="text-xs text-gray-400">Processed in {elapsed}ms</p>
            </div>
          )}
          {!result && !error && !loading && <p className="text-gray-400 text-sm text-center py-8">Upload a prescription to get started</p>}
        </div>
      </div>

      {/* High-Risk Controlled Drug Warning */}
      {!!r?.has_high_risk_flag && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5 mb-6">
          <p className="text-sm font-bold text-red-800 mb-1">🚨 HIGH RISK — CONTROLLED SUBSTANCE DETECTED</p>
          <p className="text-xs text-red-700">This prescription contains controlled substances. Strict doctor supervision is required. Verify at your local hospital or pharmacy.</p>
          <p className="text-xs text-red-700 mt-2 font-medium" dir="rtl">🚨 اعلیٰ خطرہ — کنٹرول شدہ ادویات پائی گئیں۔ سخت ڈاکٹر کی نگرانی ضروری ہے۔ اپنے قریبی ہسپتال یا فارمیسی سے تصدیق کریں۔</p>
        </div>
      )}

      {/* Bilingual Summaries */}
      {result && r && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {!!r.summary_en && (
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-5">
              <p className="text-xs font-medium text-purple-500 mb-1">English Summary</p>
              <p className="text-sm text-purple-800 leading-relaxed">{S(r.summary_en)}</p>
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

      {/* Medicines List */}
      {medicines.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Parsed Medicines</h3>
          <div className="space-y-3">
            {medicines.map((med, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {formIcons[(S(med.form) || "").toLowerCase()] || "💊"}
                    </span>
                    <div>
                      <h4 className="font-semibold text-gray-900">{S(med.name)}</h4>
                      {S(med.generic_name) && <p className="text-xs text-gray-400">{S(med.generic_name)}</p>}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    {S(med.dosage) && <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">{S(med.dosage)}</span>}
                    {S(med.form) && <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium ml-1">{S(med.form)}</span>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  {S(med.frequency) && (
                    <div className="bg-blue-50 rounded p-2">
                      <span className="text-blue-400">Frequency</span>
                      <p className="text-blue-800 font-medium mt-0.5">{S(med.frequency)}</p>
                    </div>
                  )}
                  {S(med.duration) && (
                    <div className="bg-green-50 rounded p-2">
                      <span className="text-green-400">Duration</span>
                      <p className="text-green-800 font-medium mt-0.5">{S(med.duration)}</p>
                    </div>
                  )}
                  {S(med.instructions) && (
                    <div className="bg-amber-50 rounded p-2">
                      <span className="text-amber-400">Instructions</span>
                      <p className="text-amber-800 font-medium mt-0.5">{S(med.instructions)}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Set Medicine Reminders Button */}
      {reminders.length > 0 && prescriptionId && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-purple-800 uppercase tracking-wider">
                Medication Reminders
              </h3>
              <p className="text-xs text-purple-600 mt-1">
                Activate push notifications for {reminders.filter((rm) => ((rm.cron_expressions as string[]) || []).length > 0).length} medicine{reminders.filter((rm) => ((rm.cron_expressions as string[]) || []).length > 0).length !== 1 ? "s" : ""}.
              </p>
            </div>
            <button
              onClick={activateReminders}
              disabled={reminderLoading}
              className="px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
            >
              {reminderLoading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span> Activating...
                </span>
              ) : (
                "Set Medicine Reminders"
              )}
            </button>
          </div>
          {reminderResult && (
            <div
              className={`mt-3 rounded-lg p-3 text-sm ${
                (reminderResult.success as boolean)
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}

            >
              <p className="font-medium">
                {(reminderResult.success as boolean) ? "✅" : "⚠️"}{" "}
                {S(reminderResult.message)}
              </p>
              {(reminderResult.activated_count as number) > 0 && (
                <p className="text-xs mt-1 opacity-80">
                  {reminderResult.activated_count as number} reminder{(reminderResult.activated_count as number) > 1 ? "s" : ""} created.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Browser Notification Reminder Button */}
      {medicines.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-indigo-800 uppercase tracking-wider">
                🔔 Browser Medicine Reminders
              </h3>
              <p className="text-xs text-indigo-600 mt-1">
                Get web notifications at scheduled times for {medicines.length} medicine{medicines.length !== 1 ? "s" : ""}.
              </p>
              <p className="text-xs text-indigo-600 mt-0.5" dir="rtl">
                دوائی کے لیے ریمائنڈر لگائیں — مقررہ وقت پر ویب نوٹیفکیشن حاصل کریں۔
              </p>
            </div>
            <button
              onClick={activateBrowserNotifications}
              className="px-5 py-2.5 rounded-lg font-medium text-sm transition-colors bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
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

      {/* Reminder Schedules */}
      {reminders.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Reminder Schedules</h3>
          <div className="space-y-3">
            {reminders.map((rem, i) => {
              const crons = (rem.cron_expressions as string[]) || [];
              return (
                <div key={i} className={`border rounded-lg p-4 ${crons.length > 0 ? "border-blue-200 bg-blue-50/50" : "border-gray-100 bg-gray-50/50"}`}>
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900">{S(rem.medicine_name)}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${crons.length > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500"}`}>
                      {crons.length > 0 ? `${crons.length} reminder${crons.length > 1 ? "s" : ""}/day` : "As needed"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{S(rem.schedule_description)}</p>
                  {crons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {crons.map((c, j) => (
                        <code key={j} className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded font-mono">{c}</code>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Raw OCR Text */}
      {!!r?.raw_extracted_text && (
        <details className="bg-gray-100 rounded-xl p-4 mb-6">
          <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-900">Raw Extracted Text (OCR)</summary>
          <pre className="mt-3 text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white p-4 rounded-lg border">{S(r.raw_extracted_text)}</pre>
        </details>
      )}

      {/* Voice Response Player */}
      {audioResponse && (
        <VoiceResponsePlayer
          audioResponse={audioResponse}
          autoPlay={false}
          accentClass="bg-purple-600 hover:bg-purple-700"
        />
      )}

      {/* Contextual Follow-Up Chat */}
      <AgentFollowUpChat
        initialContext={result}
        agentTarget="care-sync"
        accentClass="bg-purple-600 hover:bg-purple-700"
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function extractTimesFromCrons(crons: string[]): string[] {
  return crons.map((cron) => {
    const parts = cron.split(" ");
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    if (isNaN(hour) || isNaN(minute)) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }).filter(Boolean) as string[];
}
