/**
 * ChatFileUpload.tsx — In-chat attach button for file uploads.
 *
 * Renders a paperclip icon that opens the device file picker.
 * Selected files are read as base64 and passed up via the onFile callback,
 * matching the payload shape already used by Track A endpoints (media_base64).
 *
 * Only rendered when agent.acceptsUpload is true (Pharma-Check, Lingo-Med,
 * Care-Sync, Orchestrator) — Triage, Geo-Locator and Auto-Booking have no
 * use for a photo, so the button doesn't appear there.
 */

"use client";

import { useRef } from "react";
import { Paperclip } from "lucide-react";

interface FilePayload {
  base64: string;
  name: string;
  mimeType: string;
}

export default function ChatFileUpload({
  onFile,
}: {
  onFile: (f: FilePayload) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string; // "data:image/png;base64,AAAA..."
      const base64 = result.split(",")[1];
      onFile({ base64, name: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);

    // Allow re-selecting the same file
    e.target.value = "";
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        aria-label="Attach file"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full"
        style={{ backgroundColor: "#CAF0C1" }}
      >
        <Paperclip size={18} color="#015D67" />
      </button>
    </>
  );
}
