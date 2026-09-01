"use client";

import { clearAllConsent } from "@/lib/consent/consentStore";

interface PrivacyNoticeProps {
  /** Called after local data is cleared, e.g. to reset parent UI state. */
  onDataCleared?: () => void;
}

export default function PrivacyNotice({ onDataCleared }: PrivacyNoticeProps) {
  function handleClear() {
    clearAllConsent();
    onDataCleared?.();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500 leading-relaxed">
      <p className="mb-3">
        We keep your appointment records (E-Parchi) and your consent
        choices on this device so you can access them again. We do not
        sell or share your health information with any third party. You
        can clear everything stored by Sehat-Assist AI at any time using
        the button below.
      </p>
      <button
        type="button"
        onClick={handleClear}
        className="text-red-500 hover:text-red-700 font-medium underline underline-offset-2"
      >
        Clear my data
      </button>
    </div>
  );
}
