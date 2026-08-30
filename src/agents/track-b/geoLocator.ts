/**
 * ─────────────────────────────────────────────────────────────────────────────
 * geoLocator.ts — Nearest hospital lookup (Track B).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Uses the Google Places API (New) Nearby Search endpoint to find the
 * nearest hospitals based on the patient's GPS coordinates.
 *
 * Input:  { latitude: 24.8607, longitude: 67.0011, type: "hospital" }
 * Output: [{ name: "Aga Khan Hospital", distance_km: 2.3, ... }]
 */

import type { GeoLocatorResult, Facility } from "@/types/orchestrator";

// ─── Constants ──────────────────────────────────────────────────────────────

const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchNearby";

/** Search radius in meters for "nearest" strategy (10 km) */
const RADIUS_NEAREST_METERS = 10_000;

/** Search radius in meters for "best" and "balanced" strategies (25 km) */
const RADIUS_EXTENDED_METERS = 25_000;

/** Maximum results per request */
const MAX_RESULT_COUNT = 10;

/** Advisory note attached to facilities where Google has no opening-hours data */
const HOURS_UNVERIFIED_NOTE =
  "Opening hours could not be confirmed for this facility — please call ahead before traveling, especially at night.";

/** Top-level disclaimer about open_now semantics */
const OPEN_HOURS_DISCLAIMER =
  "open_now reflects general facility operating hours as reported to Google. " +
  "It does not confirm Emergency Room staffing, bed availability, or specialist " +
  "on-duty status. For genuine emergencies, call ahead or dial emergency services.";

/**
 * Fields requested from Places API (New).
 * Controls which data is returned per place and affects billing tier.
 */
const FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.nationalPhoneNumber",
  "places.currentOpeningHours.openNow",
  "places.id",
].join(",");

// ─── Haversine Distance ─────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate straight-line distance in kilometers between two GPS coordinates
 * using the Haversine formula.
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Ranking Strategy Type ──────────────────────────────────────────────────

export type RankingStrategy = "nearest" | "best" | "balanced";

// ─── Safety Grouping Helper ─────────────────────────────────────────────────

/**
 * Assign a priority tier to a facility based on its open/hours status.
 * This 3-tier grouping is a SAFETY behavior and is preserved across all
 * ranking strategies:
 *   0 = confirmed open now (highest priority)
 *   1 = hours unverified (unknown — could be open or closed)
 *   2 = confirmed closed (lowest priority)
 */
function safetyGroup(f: Facility): number {
  if (f.open_now === true) return 0;
  if (f.hours_unverified === true) return 1;
  return 2;
}

// ─── Strategy-Specific Sort Helpers ─────────────────────────────────────────

/**
 * Within-group comparator for the "nearest" strategy.
 * Sorts by distance ascending (closest first).
 */
function sortNearest(a: Facility, b: Facility): number {
  return a.distance_km - b.distance_km;
}

/**
 * Within-group comparator for the "best" strategy.
 * Sorts by rating descending; facilities with null rating sink to the bottom.
 */
function sortBest(a: Facility, b: Facility): number {
  if (a.rating === null && b.rating === null) return 0;
  if (a.rating === null) return 1;  // a sinks
  if (b.rating === null) return -1; // b sinks
  return b.rating - a.rating;       // highest rating first
}

/**
 * Compute the combined score used by the "balanced" strategy.
 * Formula: 0.6 * (rating / 5) + 0.4 * (1 - min(distance / radius, 1))
 * Missing rating is treated as 0 for this formula only.
 */
function balancedScore(f: Facility, radiusKm: number): number {
  const ratingNorm = f.rating !== null ? f.rating / 5 : 0;
  const distNorm = 1 - Math.min(f.distance_km / radiusKm, 1);
  return 0.6 * ratingNorm + 0.4 * distNorm;
}

/**
 * Within-group comparator for the "balanced" strategy.
 * Sorts by combined score descending (best score first).
 */
function sortBalanced(a: Facility, b: Facility, radiusKm: number): number {
  return balancedScore(b, radiusKm) - balancedScore(a, radiusKm);
}

// ─── Main Search Function ───────────────────────────────────────────────────

/**
 * Search for nearby hospitals via the Google Places API (New) Nearby Search.
 *
 * @param latitude - GPS latitude of the patient
 * @param longitude - GPS longitude of the patient
 * @param facilityType - Accepted for API compatibility; specialty-based
 *   filtering is not supported by the searchNearby endpoint. Results are
 *   always hospitals.
 * @param _requestId - Request identifier for tracing (unused currently)
 * @param rankingStrategy - How to rank and sort results:
 *   "nearest" (default): 10 km radius, sort by distance
 *   "best": 25 km radius, sort by rating descending
 *   "balanced": 25 km radius, sort by combined distance+rating score
 * @returns GeoLocator result with nearby facilities, safety-first sorting, and nearest_open_facility
 * @throws Error if GOOGLE_MAPS_API_KEY is missing or the API returns an error
 */
export async function executeGeoLocate(
  latitude: number,
  longitude: number,
  facilityType: string | undefined,
  _requestId: string,
  rankingStrategy: RankingStrategy = "nearest"
): Promise<GeoLocatorResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "[GeoLocator] GOOGLE_MAPS_API_KEY environment variable is not set. " +
        "Add it to your .env file. You can obtain a key from the " +
        "Google Cloud Console (enable the Places API (New) on the project)."
    );
  }

  // ── Determine search radius based on ranking strategy ──
  const radiusMeters = rankingStrategy === "nearest"
    ? RADIUS_NEAREST_METERS
    : RADIUS_EXTENDED_METERS;
  const radiusKm = radiusMeters / 1000;

  // NOTE: The searchNearby endpoint does not support keyword-based specialty
  // filtering (the legacy API's `keyword` parameter has no equivalent here).
  // Results are always hospitals. The `facilityType` parameter is accepted
  // for interface compatibility but is not used in the API call.
  void facilityType;

  // ── Build request body ──
  const requestBody = {
    includedTypes: ["hospital"],
    maxResultCount: MAX_RESULT_COUNT,
    locationRestriction: {
      circle: {
        center: { latitude, longitude },
        radius: radiusMeters,
      },
    },
  };

  // ── Call Google Places API (New) Nearby Search ──
  const apiResponse = await fetch(PLACES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(requestBody),
  });

  const data = await apiResponse.json();

  if (!apiResponse.ok) {
    // Places API (New) returns errors as JSON: { error: { message, status } }
    const errorMsg = data.error?.message ?? `${apiResponse.status} ${apiResponse.statusText}`;
    throw new Error(
      `[GeoLocator] Google Places API error: ${errorMsg}`
    );
  }

  // ── Map results to Facility type ──
  const facilities: Facility[] = (data.places ?? []).map(
    (place: GooglePlaceResult) => {
      const distance_km = parseFloat(
        haversineDistance(
          latitude,
          longitude,
          place.location.latitude,
          place.location.longitude
        ).toFixed(2)
      );

      const openNow = place.currentOpeningHours?.openNow;

      return {
        name: place.displayName?.text ?? "Unknown",
        type: "hospital",
        address: place.formattedAddress ?? "",
        distance_km,
        rating: place.rating ?? null,
        phone: place.nationalPhoneNumber ?? null,
        open_now: openNow,
        ...(openNow === undefined
          ? { hours_unverified: true as const, hours_note: HOURS_UNVERIFIED_NOTE }
          : {}),
      };
    }
  );

  // ── Sort: 3-tier safety grouping, then strategy-specific within each tier ──
  // Tier 0: confirmed open now (highest)
  // Tier 1: hours unverified (unknown)
  // Tier 2: confirmed closed (lowest)
  // This grouping is a safety behavior preserved across ALL strategies.
  facilities.sort((a, b) => {
    const groupA = safetyGroup(a);
    const groupB = safetyGroup(b);
    if (groupA !== groupB) return groupA - groupB;

    // Within the same safety tier, apply strategy-specific sort
    switch (rankingStrategy) {
      case "best":
        return sortBest(a, b);
      case "balanced":
        return sortBalanced(a, b, radiusKm);
      case "nearest":
      default:
        return sortNearest(a, b);
    }
  });

  // ── Determine nearest confirmed-open facility (distance-based, strategy-independent) ──
  // This is always the geographically closest confirmed-open facility regardless of
  // how the list is sorted for display. Using a min-distance scan instead of
  // facilities.find() ensures correctness across all ranking strategies.
  const openFacilities = facilities.filter((f) => f.open_now === true);
  const nearestOpen = openFacilities.reduce<Facility | null>(
    (closest, f) => (closest === null || f.distance_km < closest.distance_km ? f : closest),
    null
  );
  const nearest_open_facility = nearestOpen?.name ?? null;

  return {
    facilities,
    nearest_open_facility,
    search_radius_km: radiusKm,
    location: { latitude, longitude },
    open_hours_disclaimer: OPEN_HOURS_DISCLAIMER,
    ranking_strategy_used: rankingStrategy,
    // Placeholder confidence for the prototype — replace with a real
    // confidence score once the ranking/weighting logic is refined.
    confidence: 0.85,
  };
}

// ─── Places API (New) Response Types ────────────────────────────────────────

interface GooglePlaceResult {
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  rating?: number;
  nationalPhoneNumber?: string;
  currentOpeningHours?: {
    openNow?: boolean;
  };
  location: {
    latitude: number;
    longitude: number;
  };
  id?: string;
}
