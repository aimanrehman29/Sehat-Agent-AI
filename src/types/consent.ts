export type ConsentFeature = "microphone" | "camera" | "location";

export interface ConsentRecord {
  granted: boolean;
  /** ISO 8601 timestamp of when the user made this choice. */
  timestamp: string;
}

/** One record per feature. null = user has never been asked. */
export type ConsentState = Record<ConsentFeature, ConsentRecord | null>;

export const CONSENT_FEATURES: ConsentFeature[] = [
  "microphone",
  "camera",
  "location",
];
