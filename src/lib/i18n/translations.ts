/**
 * translations.ts — UI string translations (English/Urdu).
 *
 * These are UI labels, header text, and generic placeholders.
 * Agent-specific names/taglines live in agentConfig.ts (nameUr, taglineUr, placeholderUr).
 *
 * Urdu strings are stored as unicode escape sequences to avoid encoding issues.
 * TypeScript/React renders them as normal Urdu text at runtime.
 *
 * NOTE: These Urdu translations are good-faith translations, not verified by
 * a native speaker. Have a fluent Urdu speaker review before demo day.
 */

export const UI_STRINGS = {
  en: {
    chooseAssistant: "CHOOSE AN ASSISTANT",
    tagline: "Your health, one tap away",
    talkToAssistant: "Talk to Sehat-Agent",
    shareLocation: "Share location",
    thinking: "Thinking...",
  },
  ur: {
    chooseAssistant: "\u0645\u0639\u0627\u0648\u0646 \u0645\u0646\u062a\u062e\u0628 \u06a9\u0631\u06cc\u06ba",
    tagline: "\u0622\u067e \u06a9\u06cc \u0635\u062d\u062a\u060c \u0627\u06cc\u06a9 \u0679\u06cc\u067e \u06a9\u06cc \u062f\u0648\u0631\u06cc \u067e\u0631",
    talkToAssistant: "\u0633\u06c1\u062a \u0627\u0633\u0633\u0679 \u0633\u06d2 \u0628\u0627\u062a \u06a9\u0631\u06cc\u06ba",
    shareLocation: "\u0645\u0642\u0627\u0645 \u0634\u06cc\u0626\u0631 \u06a9\u0631\u06cc\u06ba",
    thinking: "\u0633\u0648\u0686 \u0631\u06c1\u0627 \u06c1\u0648\u06ba...",
  },
} as const;
