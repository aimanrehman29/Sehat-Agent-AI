/**
 * TriageCard.tsx — Displays Triage agent result (department, urgency, action).
 *
 * Used by ResultRenderer to show symptom → department routing.
 * When `compact` is true, renders a condensed version (used when
 * triage_context is shown above a chained GeoLocator result).
 */

interface TriageCardProps {
  result: {
    department: string;
    urgency: string;
    action?: string;
    suggested_specialist?: string | null;
  };
  /** Compact mode — omits action text, used for chained results */
  compact?: boolean;
}

export default function TriageCard({ result, compact }: TriageCardProps) {
  return (
    <div
      className={`w-full border rounded-lg p-3 mb-3 ${
        compact ? "bg-gray-50" : ""
      }`}
    >
      <p className="text-sm font-medium text-[#015D47]">
        Suggested department: {result.department}
      </p>
      <p className="text-xs text-gray-600 mt-1">Urgency: {result.urgency}</p>
      {!compact && result.action && (
        <p className="text-xs text-gray-600 mt-1">{result.action}</p>
      )}
    </div>
  );
}
