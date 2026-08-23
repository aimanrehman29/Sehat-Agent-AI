/**
 * Sehat-Agent AI — Landing Page
 * Provides overview and navigation to the three Track A agent modules.
 */

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Sehat-Agent AI
          </h1>
          <p className="text-lg text-slate-600">
            Track A — Intelligent Healthcare Analysis
          </p>
          <p className="text-sm text-slate-400 mt-1">
            Assist, not Diagnose
          </p>
          <Link
            href="/test"
            className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors no-underline shadow-lg shadow-blue-200"
          >
            <span>🧪</span> Open Test Console
          </Link>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Pharma-Check AI */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
            <div className="text-3xl mb-3">🔬</div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">
              Pharma-Check AI
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Fake medicine detector. Scan barcodes, QR codes, and DRAP
              registration numbers to verify drug authenticity.
            </p>
            <code className="text-xs text-slate-400 block bg-slate-50 p-2 rounded">
              POST /api/track-a/pharma-check
            </code>
          </div>

          {/* Lingo-Med AI */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
            <div className="text-3xl mb-3">📋</div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">
              Lingo-Med AI
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Lab report simplifier. Upload your lab report and get
              plain-language explanations of your results.
            </p>
            <code className="text-xs text-slate-400 block bg-slate-50 p-2 rounded">
              POST /api/track-a/lingo-med
            </code>
          </div>

          {/* Care-Sync AI */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
            <div className="text-3xl mb-3">💊</div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">
              Care-Sync AI
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Prescription parser & reminders. Scan your prescription and
              set up automated medication reminders.
            </p>
            <code className="text-xs text-slate-400 block bg-slate-50 p-2 rounded">
              POST /api/track-a/care-sync/parse
            </code>
          </div>
        </div>

        <footer className="text-center mt-12 text-xs text-slate-400">
          <p>
            This AI-generated analysis is for informational purposes only.
            Always consult a qualified healthcare provider.
          </p>
        </footer>
      </div>
    </main>
  );
}
