"use client";

import { useConsentGate } from "@/lib/consent/useConsentGate";
import ConsentModal from "@/components/consent/ConsentModal";
import PrivacyNotice from "@/components/consent/PrivacyNotice";

export default function ConsentTestPage() {
  const mic = useConsentGate("microphone");
  const cam = useConsentGate("camera");
  const loc = useConsentGate("location");

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Consent Layer Test</h1>

        <button onClick={() => mic.requestAccess()} className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm">
          Test Microphone Consent — granted: {String(mic.granted)}
        </button>

        <button onClick={() => cam.requestAccess()} className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm">
          Test Camera Consent — granted: {String(cam.granted)}
        </button>

        <button onClick={() => loc.requestAccess()} className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm">
          Test Location Consent — granted: {String(loc.granted)}
        </button>

        <PrivacyNotice onDataCleared={() => window.location.reload()} />
      </div>

      <ConsentModal feature="microphone" open={mic.modalOpen} onAccept={mic.onAccept} onDecline={mic.onDecline} />
      <ConsentModal feature="camera" open={cam.modalOpen} onAccept={cam.onAccept} onDecline={cam.onDecline} />
      <ConsentModal feature="location" open={loc.modalOpen} onAccept={loc.onAccept} onDecline={loc.onDecline} />
    </main>
  );
}
