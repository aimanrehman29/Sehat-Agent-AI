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

/** Search radius in meters (10 km) */
const SEARCH_RADIUS_METERS = 10_000;

/** Maximum results per request */
const MAX_RESULT_COUNT = 10;

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
 * @returns GeoLocator result with nearby facilities sorted by distance
 * @throws Error if GOOGLE_MAPS_API_KEY is missing or the API returns an error
 */
export async function executeGeoLocate(
  latitude: number,
  longitude: number,
  facilityType: string | undefined,
  _requestId: string
): Promise<GeoLocatorResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "[GeoLocator] GOOGLE_MAPS_API_KEY environment variable is not set. " +
        "Add it to your .env file. You can obtain a key from the " +
        "Google Cloud Console (enable the Places API (New) on the project)."
    );
  }

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
        radius: SEARCH_RADIUS_METERS,
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

      return {
        name: place.displayName?.text ?? "Unknown",
        type: "hospital",
        address: place.formattedAddress ?? "",
        distance_km,
        rating: place.rating ?? null,
        phone: place.nationalPhoneNumber ?? null,
        open_now: place.currentOpeningHours?.openNow,
      };
    }
  );

  // ── Sort by calculated distance (nearest first) ──
  facilities.sort((a, b) => a.distance_km - b.distance_km);

  return {
    facilities,
    search_radius_km: 10,
    location: { latitude, longitude },
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
