"use client";

/**
 * HospitalResultCard — Displays a single hospital facility result from
 * the GeoLocator agent with call-to-action buttons.
 *
 * Features:
 *   - Hospital name, address, distance, rating
 *   - Open/closed/unknown badge with hours_unverified support
 *   - "Call Hospital" native tel: link (graceful fallback when phone is null)
 *   - Desktop-only hint about tel: links not working on desktop browsers
 *   - "Book Appointment via AI" button with honest pending-provider banner
 */

import React, { useState } from "react";
import type { Facility } from "@/types/orchestrator";

// ─── Props ──────────────────────────────────────────────────────────────────

interface HospitalResultCardProps {
  facility: Facility;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function HospitalResultCard({ facility }: HospitalResultCardProps) {
  const [showBookingBanner, setShowBookingBanner] = useState(false);

  // ── Open/closed badge logic ──
  let badgeText: string;
  let badgeColor: string;

  if (facility.hours_unverified) {
    badgeText = "Hours unverified";
    badgeColor = "bg-yellow-900/40 text-yellow-300 border-yellow-700";
  } else if (facility.open_now === true) {
    badgeText = "Open now";
    badgeColor = "bg-green-900/40 text-green-300 border-green-700";
  } else if (facility.open_now === false) {
    badgeText = "Closed";
    badgeColor = "bg-red-900/40 text-red-300 border-red-700";
  } else {
    badgeText = "Hours unknown";
    badgeColor = "bg-gray-800 text-gray-400 border-gray-700";
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">{facility.name}</h3>
          <p className="text-sm text-gray-400">{facility.address}</p>
        </div>
        <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border ${badgeColor}`}>
          {badgeText}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-400">
        <span>{facility.distance_km} km away</span>
        {facility.rating !== null && (
          <span>
            ★ {facility.rating.toFixed(1)}
          </span>
        )}
      </div>

      {/* Hours unverified note */}
      {facility.hours_unverified && facility.hours_note && (
        <p className="text-xs text-yellow-400/80 italic">{facility.hours_note}</p>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 pt-1">
        {/* Call Hospital */}
        {facility.phone ? (
          <div className="space-y-1">
            <a
              href={`tel:${facility.phone}`}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call Hospital
            </a>
            {/* Desktop hint — only visible on md+ screens */}
            <p className="hidden md:block text-[11px] text-gray-500 max-w-[220px]">
              On desktop, note the number ({facility.phone}) or open this page on your mobile device — tel: links may not work here.
            </p>
          </div>
        ) : (
          <span className="text-sm text-gray-500 italic py-2">
            Phone number not available
          </span>
        )}

        {/* Book via AI */}
        <button
          onClick={() => setShowBookingBanner(true)}
          className="inline-flex items-center gap-2 bg-indigo-700 hover:bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Book Appointment via AI
        </button>
      </div>

      {/* AI Booking Status Banner (inline, not a browser alert) */}
      {showBookingBanner && (
        <div className="bg-indigo-900/30 border border-indigo-700 rounded-lg p-4 text-sm text-indigo-200 space-y-2">
          <p>
            AI-assisted voice booking is fully built and tested — it&apos;s currently pending
            a funded telephony provider connection. In the meantime, please use
            &lsquo;Call Hospital&rsquo; to book directly.
          </p>
          <button
            onClick={() => setShowBookingBanner(false)}
            className="text-indigo-400 hover:text-indigo-300 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
