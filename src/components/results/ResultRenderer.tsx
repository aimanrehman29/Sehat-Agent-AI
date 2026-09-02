/**
 * ResultRenderer.tsx — Routes each Orchestrator response shape to the right card.
 *
 * The Orchestrator can return any one of several very different result shapes
 * (Triage, GeoLocator, Emergency, fallback, error) — this component looks at
 * what came back and picks the right display, instead of the homepage having
 * a giant if/else.
 *
 * For chained results (GeoLocator with triage_context), renders TriageCard
 * in compact mode above the hospital list.
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
  // ── Error responses ──
  if (response?.status === "error" || response?.error) {
    return (
      <ErrorCard
        message={response.error?.message ?? "Something went wrong."}
      />
    );
  }

  const source = response?.agent_source;
  const result = response?.result;

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
          {result.triage_context && (
            <TriageCard result={result.triage_context} compact />
          )}
          <HospitalListCard result={result} />
        </>
      );
      break;

    case "orchestrator":
      content = <FallbackCard result={result} />;
      break;

    default:
      content = (
        <FallbackCard result={result ?? { summary_text: "No response." }} />
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
