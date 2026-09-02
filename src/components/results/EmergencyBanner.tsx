/**
 * EmergencyBanner.tsx — Highest-priority visual treatment for emergency results.
 *
 * This must be visually unmistakable — full-width, high-contrast, impossible
 * to miss or scroll past accidentally. This is the single most safety-critical
 * piece of UI in the whole app.
 *
 * NOTE: Colors stay as red/orange (not brand teal) — these are universal
 * safety/status colors that must be instantly recognizable in a genuine emergency.
 */

interface EmergencyBannerProps {
  result: {
    severity: "NONE" | "MODERATE" | "HIGH" | "CRITICAL";
    detected_keywords?: string[];
    actions_taken?: string[];
    is_emergency?: boolean;
  };
}

export default function EmergencyBanner({ result }: EmergencyBannerProps) {
  const isCritical = result.severity === "CRITICAL";

  return (
    <div
      role="alert"
      className={`w-full rounded-lg p-4 mb-4 border-2 ${
        isCritical
          ? "bg-red-50 border-red-600"
          : "bg-orange-50 border-orange-500"
      }`}
    >
      <p className="font-bold text-red-700 text-base mb-2">
        {isCritical ? "EMERGENCY DETECTED" : "URGENT — SEEK HELP"}
      </p>
      {result.actions_taken && result.actions_taken.length > 0 && (
        <ul className="list-disc list-inside text-sm space-y-1 text-gray-800">
          {result.actions_taken.map((action: string, i: number) => (
            <li key={i}>{action}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
