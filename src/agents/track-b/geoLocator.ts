/**
 * ─────────────────────────────────────────────────────────────────────────────
 * geoLocator.ts — Nearest hospital lookup (Track B).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Uses the Google Maps Places API (mock) to find the nearest hospitals,
 * clinics, and pharmacies based on the patient's GPS coordinates.
 *
 * Input:  { latitude: 24.8607, longitude: 67.0011, type: "hospital" }
 * Output: [{ name: "Aga Khan Hospital", distance: "2.3 km", ... }]
 *
 * Mock implementation — returns realistic sample data for UI testing.
 * Replace with real Google Maps Places API calls in production.
 */

import type { GeoLocatorResult, Facility } from "@/types/orchestrator";

/**
 * Mock facility database — representative hospitals, clinics, and pharmacies
 * in the Karachi area for demo purposes.
 *
 * ⚠️  The phone numbers and ratings below are sample data and have NOT been
 * independently verified. They must be confirmed as accurate before being
 * shown to real users or relied on in a live demo.
 */
const MOCK_FACILITIES: Facility[] = [
  {
    name: "Aga Khan University Hospital",
    type: "hospital",
    address: "Stadium Road, P.O. Box 3500, Karachi",
    distance_km: 2.3,
    rating: 4.5,
    phone: "+92-21-111-911-911",
    open_now: true,
  },
  {
    name: "Jinnah Postgraduate Medical Centre",
    type: "hospital",
    address: "Rafique H.J. Shaheed Road, Karachi",
    distance_km: 4.1,
    rating: 3.8,
    phone: "+92-21-99201300",
    open_now: true,
  },
  {
    name: "Dr. Ziauddin Hospital",
    type: "hospital",
    address: "Shahrah-e-Ghalib, Block 6, Clifton, Karachi",
    distance_km: 5.7,
    rating: 4.2,
    phone: "+92-21-111-222-333",
    open_now: true,
  },
  {
    name: "MediCare Clinic — PECHS",
    type: "clinic",
    address: "Block 3, PECHS, Shahrah-e-Faisal, Karachi",
    distance_km: 1.8,
    rating: 4.0,
    phone: "+92-21-34567890",
    open_now: true,
  },
  {
    name: "City Health Clinic",
    type: "clinic",
    address: "Tariq Road, Dhoraji Colony, Karachi",
    distance_km: 3.2,
    rating: 3.9,
    phone: "+92-21-34987654",
    open_now: false,
  },
  {
    name: "D. Watson Pharmacy",
    type: "pharmacy",
    address: "Zamzama Boulevard, DHA Phase 5, Karachi",
    distance_km: 0.8,
    rating: 4.3,
    phone: "+92-21-35832100",
    open_now: true,
  },
  {
    name: "Fazaldin Sons Pharmacy",
    type: "pharmacy",
    address: "Shaheed-e-Millat Expressway, KDA Scheme 1, Karachi",
    distance_km: 2.5,
    rating: 4.1,
    phone: "+92-21-34123456",
    open_now: true,
  },
];

/**
 * Search for nearby medical facilities.
 *
 * @param latitude - GPS latitude of the patient
 * @param longitude - GPS longitude of the patient
 * @param facilityType - Filter by facility type (hospital, pharmacy, clinic)
 * @param _requestId - Request identifier for tracing (unused in mock)
 * @returns Mock geo-location result with nearby facilities
 */
export async function executeGeoLocate(
  latitude: number,
  longitude: number,
  facilityType: string | undefined,
  _requestId: string
): Promise<GeoLocatorResult> {
  // NOTE: latitude/longitude are accepted but NOT currently used in distance
  // calculations. The distances in MOCK_FACILITIES are static sample values,
  // not computed from the real input coordinates. This should not be mistaken
  // for working geolocation — a real implementation would use the Haversine
  // formula or the Google Maps Distance Matrix API.

  // ── Filter facilities by type (if specified) ──
  let filtered = MOCK_FACILITIES;
  if (facilityType) {
    filtered = MOCK_FACILITIES.filter((f) => f.type === facilityType);
  }

  // ── Sort by distance ──
  filtered = [...filtered].sort((a, b) => a.distance_km - b.distance_km);

  return {
    facilities: filtered,
    search_radius_km: 10,
    location: { latitude, longitude },
    // Placeholder confidence for the prototype — replace with a real
    // confidence score once actual Google Maps Places API integration is in place.
    confidence: 0.85,
  };
}
