/**
 * HospitalListCard.tsx — Displays GeoLocator agent results (nearby hospitals).
 *
 * Shows each facility with:
 *   - Name, address, distance, travel time, rating
 *   - Open/closed status badge (green "Open" is semantic, NOT brand color)
 *   - Hours unverified note
 *   - Directions and Call buttons (44px min-height for thumb-tappable targets)
 *
 * Brand colors (addendum):
 *   - Directions button: Pistachio (#CAF0C1) bg + Forest Green (#015D47) text
 *   - Call button: semantic green (unchanged, indicates "available/good")
 */

interface Facility {
  name: string;
  type?: string;
  address: string;
  distance_km: number;
  rating: number | null;
  phone: string | null;
  open_now?: boolean;
  hours_unverified?: boolean;
  hours_note?: string;
  travel_time_minutes?: number | null;
  travel_time_text?: string | null;
  navigation_link?: string;
}

interface HospitalListCardProps {
  result: {
    facilities?: Facility[];
    nearest_open_facility?: string | null;
    open_hours_disclaimer?: string;
    ranking_strategy_used?: string;
  };
}

export default function HospitalListCard({ result }: HospitalListCardProps) {
  return (
    <div className="w-full">
      {result.open_hours_disclaimer && (
        <p className="text-xs text-gray-500 mb-2">
          {result.open_hours_disclaimer}
        </p>
      )}
      <div className="space-y-3">
        {result.facilities?.map((f, i) => (
          <div key={i} className="border rounded-lg p-3">
            {/* Name + status badge row */}
            <div className="flex justify-between items-start">
              <p className="font-medium text-sm">{f.name}</p>
              {f.open_now === true && (
                <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                  Open
                </span>
              )}
              {f.hours_unverified && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  Hours unknown
                </span>
              )}
            </div>

            {/* Address */}
            <p className="text-xs text-gray-600 mt-1">{f.address}</p>

            {/* Distance / travel time / rating */}
            <div className="flex gap-3 mt-2 text-xs text-gray-700">
              <span>{f.distance_km} km</span>
              {f.travel_time_text && (
                <span>{f.travel_time_text} drive</span>
              )}
              {f.rating != null && <span>★ {f.rating}</span>}
            </div>

            {/* Hours note */}
            {f.hours_note && (
              <p className="text-xs text-orange-600 mt-1">{f.hours_note}</p>
            )}

            {/* Action buttons — 44px min-height for thumb-tappable targets */}
            <div className="flex gap-2 mt-2">
              {f.navigation_link && (
                <a
                  href={f.navigation_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center text-xs font-medium text-[#015D47] bg-[#CAF0C1] rounded-lg min-h-[40px] flex items-center justify-center"
                >
                  Directions
                </a>
              )}
              {f.phone && (
                <a
                  href={`tel:${f.phone}`}
                  className="flex-1 text-center text-xs font-medium text-green-700 bg-green-50 rounded-lg min-h-[40px] flex items-center justify-center"
                >
                  Call
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
