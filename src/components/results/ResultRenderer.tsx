/**
 * ResultRenderer.tsx — Routes each response shape to the right card.
 *
 * The Orchestrator can return any one of several very different result shapes
 * (Triage, GeoLocator, Emergency, fallback, error) — this component looks at
 * what came back and picks the right display, instead of the chat shell having
 * a giant if/else.
 *
 * For chained results (GeoLocator with triage_context), renders TriageCard
 * in compact mode above the hospital list.
 *
 * Track A agents (pharma-check, lingo-med, care-sync) and follow-up chat
 * replies get lightweight inline summary cards — every field access is
 * defensive so a malformed/short result never throws.
 */

"use client";

import EmergencyBanner from "./EmergencyBanner";
import TriageCard from "./TriageCard";
import HospitalListCard from "./HospitalListCard";
import FallbackCard from "./FallbackCard";
import ErrorCard from "./ErrorCard";
import VoiceResponsePlayer from "@/components/voice/VoiceResponsePlayer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ResultRenderer({ response }: { response: any }) {
  // ── Malformed / non-object payloads never crash the chat ──
  if (!response || typeof response !== "object") {
    return <ErrorCard message="The server returned an unexpected response." />;
  }

  // ── Error responses ──
  if (response?.status === "error" || response?.error) {
    return (
      <ErrorCard
        message={
          response.error?.message ??
          response.error_message ??
          "Something went wrong."
        }
      />
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = response?.result ?? response;
  const source = response?.agent_source;

  // ── Successful responses — route by agent_source ──
  let content: React.ReactNode;

  switch (source) {
    case "emergency-escalation":
      content = <EmergencyBanner result={result} />;
      break;

    case "triage":
      content = <TriageCard result={result} />;
      break;

    case "geo-locator":
      // GeoLocator results chained from Triage include triage_context —
      // TriageCard is shown above the hospital list when present.
      content = (
        <>
          {result?.triage_context && (
            <TriageCard result={result.triage_context} compact />
          )}
          <HospitalListCard result={result} />
        </>
      );
      break;

    // ── Track A direct-agent results — inline summary cards ──
    case "pharma-check": {
      const status = result?.authenticity_status ?? "UNKNOWN";
      content = (
        <div className="w-full bg-white border border-brand-g16 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-900">
            {result?.scanned_item || "Scanned medicine"} — {status}
          </p>
          {result?.reasoning && (
            <p className="text-sm text-gray-700">{result.reasoning}</p>
          )}
          {result?.recommended_action && (
            <p className="text-sm text-gray-700">
              <span className="font-medium">Action: </span>
              {result.recommended_action}
            </p>
          )}
          {Array.isArray(result?.warnings) && result.warnings.length > 0 && (
            <ul className="text-xs text-amber-700 list-disc pl-4 space-y-0.5">
              {result.warnings.map(
                (w: unknown, i: number) => <li key={i}>{String(w)}</li>
              )}
            </ul>
          )}
        </div>
      );
      break;
    }

    case "lingo-med": {
      content = (
        <div className="w-full bg-white border border-brand-g16 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-900">
            Lab report summary
          </p>
          {result?.summary ? (
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {result.summary}
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              No readable metrics were found in this report.
            </p>
          )}
          {Array.isArray(result?.explanations) &&
            result.explanations.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {result.explanations.map(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (e: any, i: number) => (
                    <div key={i} className="text-xs">
                      <p className="font-medium text-gray-800">
                        {e?.test_name ?? "Metric"}
                      </p>
                      {e?.explanation && (
                        <p className="text-gray-600">{e.explanation}</p>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
        </div>
      );
      break;
    }

    case "care-sync": {
      const medicines = Array.isArray(result?.medicines) ? result.medicines : [];
      const reminders = Array.isArray(result?.reminders) ? result.reminders : [];
      content = (
        <div className="w-full bg-white border border-brand-g16 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-900">
            Prescription parsed
          </p>
          {medicines.length === 0 ? (
            <p className="text-sm text-gray-500">
              No medicines were recognized in this prescription.
            </p>
          ) : (
            <ul className="text-sm text-gray-700 space-y-1 list-disc pl-4">
              {medicines.map(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (m: any, i: number) => (
                  <li key={i}>
                    {m?.name ?? "Unknown medicine"}
                    {m?.dosage ? ` (${m.dosage})` : ""}
                    {m?.frequency ? ` — ${m.frequency}` : ""}
                  </li>
                )
              )}
            </ul>
          )}
          {reminders.length > 0 && (
            <p className="text-xs text-gray-500">
              {reminders.length} reminder schedule
              {reminders.length === 1 ? "" : "s"} created.
            </p>
          )}
        </div>
      );
      break;
    }

    case "orchestrator":
      // Fallback assistant OR contextual follow-up chat replies (ChatReplyResult
      // carries `reply` instead of `summary_text`).
      content = (
        <FallbackCard
          result={{
            summary_text:
              result?.summary_text ?? result?.reply ?? "No response.",
            suggested_capabilities: result?.suggested_capabilities,
          }}
        />
      );
      break;

    default:
      content = (
        <FallbackCard
          result={{
            summary_text:
              result?.summary_text ??
              result?.reply ??
              result?.reasoning ??
              result?.summary ??
              "No response.",
            suggested_capabilities: result?.suggested_capabilities,
          }}
        />
      );
  }

  // ── Voice playback (Section E) — renders only when audio_response exists ──
  // Track A results carry audio_response; Track B agents don't yet,
  // so this renders nothing extra for Triage/GeoLocator/Emergency results.
  const audioResponse = result?.audio_response;

  return (
    <>
      {content}
      {audioResponse && (
        <VoiceResponsePlayer audioResponse={audioResponse} autoPlay />
      )}
    </>
  );
}
