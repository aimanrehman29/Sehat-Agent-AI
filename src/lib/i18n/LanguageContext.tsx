/**
 * LanguageContext.tsx — Urdu/English language toggle context.
 *
 * Provides a global language state persisted to localStorage.
 * Wrapping the app in LanguageProvider makes useLanguage() available
 * to any component that needs translated strings.
 */

"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Lang = "en" | "ur";

interface LanguageContextValue {
  lang: Lang;
  toggleLang: () => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem("sehat_lang") as Lang | null;
    if (saved === "en" || saved === "ur") setLang(saved);
  }, []);

  function toggleLang() {
    setLang((prev) => {
      const next = prev === "en" ? "ur" : "en";
      localStorage.setItem("sehat_lang", next);
      return next;
    });
  }

  return (
    <LanguageContext.Provider value={{ lang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
