/**
 * Zod validation schemas for GeoLocator AI agent (Track B).
 * Validates both incoming requests and outgoing response payloads.
 */

import { z } from "zod";

// ─── Request Schema ─────────────────────────────────────────────────────────

export const LocateRequestSchema = z.object({
  /** GPS latitude of the patient (-90 to 90) */
  latitude: z.number().min(-90).max(90),
  /** GPS longitude of the patient (-180 to 180) */
  longitude: z.number().min(-180).max(180),
  /** Optional facility type filter (hospital, pharmacy, clinic) */
  facility_type: z.enum(["hospital", "pharmacy", "clinic"]).optional(),
  /** User identifier */
  user_id: z.string().max(100).optional(),
  /** Session identifier for multi-turn conversations */
  session_id: z.string().max(100).optional(),
  /** Ranking strategy preference (nearest, best, balanced) */
  rankingStrategy: z.enum(["nearest", "best", "balanced"]).optional(),
});

export type LocateRequest = z.infer<typeof LocateRequestSchema>;

// ─── Response Schemas ───────────────────────────────────────────────────────

export const FacilitySchema = z.object({
  /** Facility name */
  name: z.string().min(1),
  /** Facility type (hospital, pharmacy, clinic) */
  type: z.string(),
  /** Street address */
  address: z.string(),
  /** Distance from the patient in kilometers */
  distance_km: z.number().min(0),
  /** Google rating (1–5), null if unavailable */
  rating: z.number().min(0).max(5).nullable(),
  /** Contact phone number, null if unavailable */
  phone: z.string().nullable(),
  /** Whether the facility is currently open — undefined when data is unavailable */
  open_now: z.boolean().optional(),
  /** True when Google has no opening-hours data for this facility */
  hours_unverified: z.boolean().optional(),
  /** Advisory note when opening hours could not be confirmed */
  hours_note: z.string().optional(),
});

export const GeoLocatorResultSchema = z.object({
  /** Nearby facilities found */
  facilities: z.array(FacilitySchema),
  /** Name of the closest facility confirmed open right now, or null if none */
  nearest_open_facility: z.string().nullable(),
  /** Search radius in kilometers */
  search_radius_km: z.number().min(0),
  /** Origin location used for the search */
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  /** Disclaimer about open_now reflecting general hours, not ER staffing */
  open_hours_disclaimer: z.string(),
  /** Which ranking strategy was applied to sort the results */
  ranking_strategy_used: z.enum(["nearest", "best", "balanced"]),
  /** Confidence score (0–1) */
  confidence: z.number().min(0).max(1),
});

export type GeoLocatorResult = z.infer<typeof GeoLocatorResultSchema>;

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validate an incoming GeoLocator request.
 * Throws ZodError if invalid.
 */
export function validateLocateRequest(data: unknown) {
  return LocateRequestSchema.parse(data);
}

/**
 * Validate the agent's output before wrapping in response envelope.
 */
export function validateGeoLocatorResult(data: unknown) {
  return GeoLocatorResultSchema.parse(data);
}
