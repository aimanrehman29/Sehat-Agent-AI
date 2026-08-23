/**
 * Test Dashboard — overview of all three Track A agents.
 */

import Link from "next/link";

const AGENTS = [
  {
    href: "/test/pharma-check",
    icon: "🔬",
    title: "Pharma-Check AI",
    subtitle: "Fake Medicine Detector",
    description:
      "Upload a photo of medicine packaging to extract barcodes, QR codes, and DRAP registration numbers. Verifies authenticity against the drug registry.",
    endpoint: "POST /api/track-a/pharma-check",
    features: [
      "Barcode & QR code extraction",
      "DRAP registration lookup",
      "Batch/serial anomaly detection",
      "Risk score (0-100) with factors",
    ],
    color: "blue",
  },
  {
    href: "/test/lingo-med",
    icon: "📋",
    title: "Lingo-Med AI",
    subtitle: "Lab Report Simplifier",
    description:
      "Upload a lab report image or PDF to extract test metrics, flag out-of-range values, and generate plain-language explanations.",
    endpoint: "POST /api/track-a/lingo-med",
    features: [
      "OCR of printed lab reports",
      "Out-of-range metric flagging",
      "Plain-language explanations",
      "Mandatory disclaimer guardrail",
    ],
    color: "green",
  },
  {
    href: "/test/care-sync",
    icon: "💊",
    title: "Care-Sync AI",
    subtitle: "Prescription Parser & Reminders",
    description:
      "Upload a doctor's prescription (parchi) to extract medicines, dosages, schedules, and generate medication reminder cron jobs.",
    endpoint: "POST /api/track-a/care-sync/parse",
    features: [
      "Prescription OCR (handwriting-tolerant)",
      "Medicine name, dosage, frequency extraction",
      "Cron job schedule generation",
      "Reminder notification schema",
    ],
    color: "purple",
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; badge: string; link: string }> = {
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    link: "text-blue-600 hover:text-blue-800",
  },
  green: {
    bg: "bg-green-50",
    border: "border-green-200",
    badge: "bg-green-100 text-green-700",
    link: "text-green-600 hover:text-green-800",
  },
  purple: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    badge: "bg-purple-100 text-purple-700",
    link: "text-purple-600 hover:text-purple-800",
  },
};

export default function TestDashboard() {
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Test Console</h1>
        <p className="text-gray-500 mt-1">
          Select an agent to test. Upload images and see how each AI module
          processes and responds.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-full">
          <span className="text-sm">🧪</span>
          <span className="text-xs text-yellow-700 font-medium">
            Test mode — using mock API responses
          </span>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="space-y-5">
        {AGENTS.map((agent) => {
          const colors = COLOR_MAP[agent.color];
          return (
            <Link
              key={agent.href}
              href={agent.href}
              className={`block rounded-xl border-2 ${colors.border} ${colors.bg} p-6 no-underline transition-all hover:shadow-md`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{agent.icon}</span>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">
                        {agent.title}
                      </h2>
                      <p className="text-sm text-gray-500">{agent.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-3 max-w-2xl">
                    {agent.description}
                  </p>

                  {/* Features */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {agent.features.map((f) => (
                      <span
                        key={f}
                        className={`text-xs px-2 py-1 rounded-full ${colors.badge}`}
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  {/* Endpoint */}
                  <code className="block mt-4 text-xs text-gray-400 bg-white/60 px-3 py-1.5 rounded-md w-fit">
                    {agent.endpoint}
                  </code>
                </div>

                <div className={`${colors.link} text-2xl ml-4`}>→</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
