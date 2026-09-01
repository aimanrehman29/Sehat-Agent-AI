"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConsentFeature } from "@/types/consent";
import { hasConsent, setConsent } from "@/lib/consent/consentStore";

export interface UseConsentGateReturn {
  /** True if the user has already granted this feature. */
  granted: boolean;
  /** True while the consent modal should be visible. */
  modalOpen: boolean;
  /**
   * Call this before using the mic/camera/location.
   * Returns true immediately if already granted.
   * Otherwise opens the modal and returns false — the caller should
   * wait for onAccept/onDecline (see ConsentModal) before proceeding.
   */
  requestAccess: () => boolean;
  /** Pass directly to <ConsentModal onAccept={...} /> */
  onAccept: () => void;
  /** Pass directly to <ConsentModal onDecline={...} /> */
  onDecline: () => void;
}

export function useConsentGate(feature: ConsentFeature): UseConsentGateReturn {
  const [granted, setGranted] = useState<boolean>(false);

  useEffect(() => {
    setGranted(hasConsent(feature));
  }, [feature]);

  const [modalOpen, setModalOpen] = useState(false);

  const requestAccess = useCallback((): boolean => {
    if (hasConsent(feature)) {
      setGranted(true);
      return true;
    }

    setModalOpen(true);
    return false;
  }, [feature]);

  const onAccept = useCallback(() => {
    setConsent(feature, true);
    setGranted(true);
    setModalOpen(false);
  }, [feature]);

  const onDecline = useCallback(() => {
    setConsent(feature, false);
    setGranted(false);
    setModalOpen(false);
  }, [feature]);

  return { granted, modalOpen, requestAccess, onAccept, onDecline };
}
