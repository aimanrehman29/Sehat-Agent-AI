/**
 * Output sanitizer for Track A agent responses.
 * Removes potential PII, dangerous HTML, and normalizes text output.
 */

// ─── PII Patterns ───────────────────────────────────────────────────────────

const PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, label: "[CARD]" },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, label: "[SSN]" },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, label: "[EMAIL]" },
  { pattern: /\b(?:\+92|0)?3\d{2}[-\s]?\d{7}\b/g, label: "[PHONE]" },
];

/**
 * Remove PII from text output before sending to the user.
 */
export function sanitizePII(text: string): string {
  let sanitized = text;
  for (const { pattern, label } of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, label);
  }
  return sanitized;
}

/**
 * Strip HTML tags from text to prevent XSS in responses.
 */
export function stripHTML(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

/**
 * Normalize whitespace and trim text output.
 */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Full sanitization pipeline — applies all sanitization steps.
 */
export function sanitizeOutput(text: string): string {
  let result = text;
  result = stripHTML(result);
  result = sanitizePII(result);
  result = normalizeText(result);
  return result;
}

/**
 * Deep-sanitize all string values in a response object.
 * Recursively walks the object and sanitizes every string field.
 */
export function sanitizeResponseObject<T extends Record<string, unknown>>(
  obj: T
): T {
  const result = {} as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = sanitizeOutput(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "string"
          ? sanitizeOutput(item)
          : typeof item === "object" && item !== null
            ? sanitizeResponseObject(item as Record<string, unknown>)
            : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeResponseObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
