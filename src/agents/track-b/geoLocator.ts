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
 * @returns GeoLocator result with nearby facilities, open-first sorting, and nearest_open_facility
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

  // ── Sort: confirmed-open facilities first, then by distance within each group ──
  facilities.sort((a, b) => {
    const aOpen = a.open_now === true ? 0 : 1;
    const bOpen = b.open_now === true ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return a.distance_km - b.distance_km;
  });

  // ── Determine nearest confirmed-open facility ──
  const nearestOpen = facilities.find((f) => f.open_now === true);
  const nearest_open_facility = nearestOpen?.name ?? null;

  return {
    facilities,
    nearest_open_facility,
    search_radius_km: 10,
    location: { latitude, longitude },
    open_hours_disclaimer: OPEN_HOURS_DISCLAIMER,
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
