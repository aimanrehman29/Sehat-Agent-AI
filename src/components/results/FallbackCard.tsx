/**
 * FallbackCard.tsx — Displays fallback assistant response.
 *
 * Used by ResultRenderer when the Orchestrator couldn't match a specific
 * agent intent and fell back to the LLM/static assistant.
 */

interface FallbackCardProps {
  result: {
    summary_text: string;
    suggested_capabilities?: string[];
  };
}

export default function FallbackCard({ result }: FallbackCardProps) {
  return (
    <div className="w-full border rounded-lg p-3">
      <p className="text-sm whitespace-pre-line">{result.summary_text}</p>
    </div>
  );
}
