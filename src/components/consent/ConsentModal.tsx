"use client";

import type { ConsentFeature } from "@/types/consent";

interface ConsentModalProps {
  feature: ConsentFeature;
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const COPY: Record<ConsentFeature, { title: string; body: string }> = {
  microphone: {
    title: "Allow microphone access?",
    body:
      "We use your microphone to listen to your symptoms when you speak " +
      "them, so Smart Triage can suggest the right department for you. " +
      "Your voice is processed to understand your words — it is not " +
      "stored permanently.",
  },
  camera: {
    title: "Allow camera access?",
    body:
      "We use your camera to scan medicine packaging, prescriptions, or " +
      "lab reports so our agents can read and analyze them for you. " +
      "Photos are processed to extract information and are never shared " +
      "outside Sehat-Assist AI.",
  },
  location: {
    title: "Allow location access?",
    body:
      "We use your location to find hospitals and clinics near you, and " +
      "to check which ones are open right now. Your location is only " +
      "used while you are actively searching — we do not track or store " +
      "your location history.",
  },
};

const FEATURE_ICON: Record<ConsentFeature, string> = {
  microphone: "\u{1F3A4}",
  camera: "\u{1F4F7}",
  location: "\u{1F4CD}",
};

export default function ConsentModal({
  feature,
  open,
  onAccept,
  onDecline,
}: ConsentModalProps) {
  if (!open) return null;

  const copy = COPY[feature];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-sm w-full shadow-xl">
        <div className="text-3xl mb-3">{FEATURE_ICON[feature]}</div>
        <h3 className="text-base font-semibold text-gray-900 mb-2">
          {copy.title}
        </h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-5">
          {copy.body}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            Allow
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
