const STORAGE_KEY = "sehat_consent_v1";

import type { ConsentFeature, ConsentRecord, ConsentState } from "@/types/consent";

function readRaw(): ConsentState {
  if (typeof window === "undefined") {
    return { microphone: null, camera: null, location: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { microphone: null, camera: null, location: null };
    return JSON.parse(raw) as ConsentState;
  } catch {
    return { microphone: null, camera: null, location: null };
  }
}

function writeRaw(state: ConsentState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getConsentState(): ConsentState {
  return readRaw();
}

export function hasConsent(feature: ConsentFeature): boolean {
  return readRaw()[feature]?.granted === true;
}

export function wasAsked(feature: ConsentFeature): boolean {
  return readRaw()[feature] !== null;
}

export function setConsent(feature: ConsentFeature, granted: boolean): void {
  const state = readRaw();
  const record: ConsentRecord = {
    granted,
    timestamp: new Date().toISOString(),
  };
  writeRaw({ ...state, [feature]: record });
}

/** Wipes all consent choices. Called from the Privacy Notice "Clear my data" action. */
export function clearAllConsent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
