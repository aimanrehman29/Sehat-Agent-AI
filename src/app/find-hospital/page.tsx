"use client";

/**
 * Find Hospital — Search for nearby hospitals using the GeoLocator agent
 * and display results with call-to-action cards.
 *
 * Uses the existing POST /api/track-b/locate endpoint.
 * Supports manual lat/lng entry or browser geolocation via navigator.geolocation.
 */

import React, { useState, useCallback } from "react";
import HospitalResultCard from "@/app/components/HospitalResultCard";
import type { Facility } from "@/types/orchestrator";

// ─── Types ──────────────────────────────────────────────────────────────────

type SearchState = "idle" | "loading" | "success" | "error";

interface LocateResponse {
  result?: {
    facilities: Facility[];
    nearest_open_facility: string | null;
    search_radius_km: number;
    open_hours_disclaimer: string;
  };
  status?: string;
  error?: { code: string; message: string };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function FindHospitalPage() {
  // ── Form state ──
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [facilityType, setFacilityType] = useState("hospital");

  // ── Result state ──
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [nearestOpen, setNearestOpen] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [geoError, setGeoError] = useState("");

  // ── Geolocation helper ──
  const handleUseMyLocation = useCallback(() => {
    setGeoError("");

    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser. Please enter coordinates manually.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setGeoError("");
      },
      (err) => {
        setGeoError(`Could not get your location: ${err.message}. Please enter coordinates manually.`);
      },
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  }, []);

  // ── Search handler ──
  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setGeoError("");
    setErrorMsg("");

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      setErrorMsg("Please enter valid latitude and longitude numbers, or use 'Use my location'.");
      return;
    }

    setSearchState("loading");
    setFacilities([]);
    setNearestOpen(null);
    setDisclaimer("");

    try {
      const res = await fetch("/api/track-b/locate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          facility_type: facilityType || undefined,
        }),
      });

      const data: LocateResponse = await res.json();

      if (!res.ok || data.error) {
        setSearchState("error");
        setErrorMsg(data.error?.message ?? `Request failed with status ${res.status}`);
        return;
      }

      if (data.result?.facilities) {
        setFacilities(data.result.facilities);
        setNearestOpen(data.result.nearest_open_facility);
        setDisclaimer(data.result.open_hours_disclaimer ?? "");
        setSearchState("success");
      } else {
        setSearchState("error");
        setErrorMsg("No facility data returned. The GeoLocator service may be unavailable.");
      }
    } catch (err) {
      setSearchState("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error — could not reach the server.");
    }
  }, [latitude, longitude, facilityType]);

  // ── Render ──

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-emerald-400">
            Find Nearby Hospitals
          </h1>
          <p className="text-gray-400 text-sm">
            Powered by the GeoLocator agent — finds hospitals within 10 km of your location.
          </p>
        </header>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="bg-gray-900 rounded-lg p-5 space-y-4">
          <h2 className="text-lg font-semibold text-emerald-300">Search Location</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm text-gray-400">Latitude</span>
              <input
                type="number"
                step="any"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder="e.g. 24.8607"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-gray-400">Longitude</span>
              <input
                type="number"
                step="any"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder="e.g. 67.0011"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleUseMyLocation}
              className="bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium px-4 py-2 rounded-lg transition-colors text-sm border border-gray-700"
            >
              Use my location
            </button>

            <label className="space-y-1 flex-1 min-w-[160px]">
              <span className="text-sm text-gray-400">Facility type</span>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                value={facilityType}
                onChange={(e) => setFacilityType(e.target.value)}
              >
                <option value="hospital">Hospital</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="clinic">Clinic</option>
              </select>
            </label>
          </div>

          {geoError && (
            <p className="text-sm text-yellow-400">{geoError}</p>
          )}

          <button
            type="submit"
            disabled={searchState === "loading"}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {searchState === "loading" ? "Searching..." : "Find Hospitals"}
          </button>
        </form>

        {/* Error State */}
        {searchState === "error" && errorMsg && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-200 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Loading State */}
        {searchState === "loading" && (
          <div className="text-center py-12 text-gray-400">
            <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p>Searching for nearby hospitals...</p>
          </div>
        )}

        {/* Results */}
        {searchState === "success" && (
          <section className="space-y-4">
            {nearestOpen && (
              <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 text-green-200 text-sm">
                Nearest confirmed open facility: <strong>{nearestOpen}</strong>
              </div>
            )}

            {facilities.length === 0 ? (
              <p className="text-center text-gray-400 py-8">
                No hospitals found in this area.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  {facilities.length} {facilities.length === 1 ? "facility" : "facilities"} found
                </p>
                {facilities.map((facility, i) => (
                  <HospitalResultCard key={`${facility.name}-${i}`} facility={facility} />
                ))}
              </div>
            )}

            {disclaimer && (
              <p className="text-xs text-gray-500 italic">{disclaimer}</p>
            )}
          </section>
        )}

        {/* Footer */}
        <footer className="text-center text-gray-600 text-xs pt-4">
          Sehat-Assist AI — GeoLocator Agent — Google Places API (New)
        </footer>
      </div>
    </div>
  );
}
