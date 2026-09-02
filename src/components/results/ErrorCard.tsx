/**
 * ErrorCard.tsx — Displays error responses from the Orchestrator.
 *
 * Used by ResultRenderer when the API returns an error status.
 */

interface ErrorCardProps {
  message: string;
}

export default function ErrorCard({ message }: ErrorCardProps) {
  return (
    <div className="w-full border border-red-300 bg-red-50 rounded-lg p-3">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}
