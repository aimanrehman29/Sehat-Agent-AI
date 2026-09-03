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
import { Paperclip, Camera } from "lucide-react";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  /**
   * Compress an image file using the browser Canvas API.
   * Resizes to max 1280px on the longest side, encodes as JPEG at 0.8 quality.
   * This keeps base64 payloads well under Vercel's ~4.5MB API body limit.
   */
  function compressImage(file: File, maxDim = 1280, quality = 0.8): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);

        // Calculate scaled dimensions
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG base64 (strip the data:image/jpeg;base64, prefix)
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image failed to load for compression"));
      };
      img.src = url;
    });
  }

  /**
   * Read file and send via callback.
   * Images are compressed client-side via Canvas before upload.
   * PDFs and other file types are sent as-is (raw base64).
   */
  async function readAndSend(file: File) {
    const isImage = file.type.startsWith("image/");
    const COMPRESS_THRESHOLD = 500_000; // 500 KB

    if (isImage && file.size > COMPRESS_THRESHOLD) {
      try {
        const base64 = await compressImage(file);
        onFile({ base64, name: file.name, mimeType: "image/jpeg" });
        return;
      } catch {
        // Compression failed — fall through to raw read
      }
    }

    // Fallback: read file as raw base64 (PDFs, small images, or compression failures)
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      onFile({ base64, name: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    readAndSend(file);
    // Allow re-selecting the same file
    e.target.value = "";
  }

  return (
    <>
      {/* Gallery/file picker — unchanged from before */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        aria-label="Attach file"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full"
        style={{ backgroundColor: "#CAF0C1" }}
      >
        <Paperclip size={18} color="#015D67" />
      </button>
      {/* Direct camera capture — opens rear camera on mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => cameraInputRef.current?.click()}
        aria-label="Take photo"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full"
        style={{ backgroundColor: "#CAF0C1" }}
      >
        <Camera size={18} color="#015D67" />
      </button>
    </>
  );
}
