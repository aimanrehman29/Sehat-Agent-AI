/**
 * DoctorLookupCard — dedicated result card for the Doctor-Lookup agent.
 *
 * lookupDoctors() returns a single Gemini-composed paragraph (summary_text),
 * not separate structured fields. When extraction couldn't determine enough
 * to search, the result carries only summary_text with no `found`/`disclaimer`
 * fields — that clarifying-question shape is rendered plainly as an assistant
 * message rather than as a search result.
 */

"use client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DoctorLookupCard({ result }: { result: any }) {
  // ── Clarifying-question shape: summary_text only, no found/disclaimer ──
  if (result?.found === undefined && result?.summary_text) {
    return (
      <div className="w-full border rounded-lg p-3">
        <p className="text-sm">{result.summary_text}</p>
      </div>
    );
  }

  // ── Search-result shape: summary_text + optional disclaimer/found flag ──
  return (
    <div className="w-full border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
          Doctor Search
        </span>
      </div>
      <p className="text-sm whitespace-pre-line">{result.summary_text}</p>
      {result.disclaimer && (
        <p className="text-xs text-gray-500 border-t pt-2">{result.disclaimer}</p>
      )}
    </div>
  );
}
