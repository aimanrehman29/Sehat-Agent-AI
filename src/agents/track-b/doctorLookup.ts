import { GoogleGenAI } from "@google/genai";
import { logger } from "@/lib/logger";

export interface DoctorLookupParams {
  /** e.g. "Cardiology" */
  department: string;
  /** Optional — narrows results to one hospital if the user already picked one. */
  hospitalName?: string;
  /** Optional — a specific doctor's name if the user is searching by name instead. */
  doctorName?: string;
  /** City or area, used to keep results geographically relevant. */
  areaHint: string;
}

export interface DoctorLookupResult {
  found: boolean;
  summary_text: string;
  disclaimer: string;
  source: "serper_web_search" | "unavailable";
}

const SEARCH_DISCLAIMER =
  "This information comes from a live web search and may be out of date. " +
  "Please confirm timings directly with the hospital before visiting.";

/**
 * Honest quota-exhaustion message shown to users when Gemini's daily API
 * quota is reached. Kept identical across doctorLookup and fallbackAssistant
 * so it reads as one consistent system message.
 */
export const QUOTA_EXHAUSTED_MESSAGE =
  "Our AI search quota for today has been reached — please try again later.";

/**
 * Detects whether a caught error is specifically a Gemini API quota
 * exhaustion (HTTP 429 / RESOURCE_EXHAUSTED). Case-insensitive check
 * against the error's string representation.
 */
export function isQuotaExhaustedError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota");
}

/**
 * Serper.dev API response shape (subset of fields we use).
 * See: https://serper.dev/docs/google-search-api
 */
interface SerperResponse {
  organic?: Array<{
    title?: string;
    snippet?: string;
    link?: string;
  }>;
}

// ─── Gemini cleanup (lazy singleton) ────────────────────────────────────────

/** Gemini model used to clean and structure raw search snippets. */
const GEMINI_CLEANUP_MODEL = "gemini-3.6-flash";

let _gemini: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (_gemini) return _gemini;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _gemini = new GoogleGenAI({ apiKey });
  return _gemini;
}

/**
 * Prompt for cleaning raw Serper snippets into a structured doctor listing.
 * Requires AT LEAST 3 doctors per department-based query, uses a strict
 * four-field format (Name | Department | Hospital | Timings), and forbids
 * ratings, opinions, or "best" language to avoid implied endorsements.
 */
const CLEANUP_PROMPT =
  "You are a strict data-extraction and formatting assistant for a Pakistani " +
  "healthcare app. Below are raw Google search snippets about doctors, " +
  "hospitals, or specialists. Extract ONLY real, usable facts and consolidate " +
  "them into one clean list.\n\n" +
  "DEDUPLICATE:\n" +
  "- If the same doctor or hospital appears in multiple snippets (even with " +
  "slightly different spellings), merge everything into ONE entry. Never " +
  "output the same doctor or hospital more than once.\n\n" +
  "DISCARD all of the following:\n" +
  "- Search engine UI text and links: 'Read more', 'Learn more', 'Visit', " +
  "'View profile', 'Sign up', 'Download', pagination labels, bare URLs.\n" +
  "- Website names, navigation menus, breadcrumbs, repeated page headings, " +
  "SEO filler, and ads.\n" +
  "- Unrelated user queries such as 'Who is the best cardiologist in " +
  "Karachi?' — a question is never a fact; do not include it.\n" +
  "- Chopped fragments, ellipses ('...'), and incomplete sentences with no " +
  "usable detail.\n\n" +
  "OUTPUT FORMAT — a plain bulleted list, one bullet per doctor. Each line " +
  "starts with '- ' followed by four fields separated by ' | ' in this exact " +
  "order:\n" +
  "1. Doctor name (prefixed with 'Dr. ')\n" +
  "2. Department/specialty\n" +
  "3. Hospital or clinic name\n" +
  "4. Timings (days and hours)\n\n" +
  "STRICT RULES:\n" +
  "1. Each bullet MUST contain exactly four pipe-separated fields in the " +
  "order above. No more, no fewer fields.\n" +
  "2. If timings are not found in the snippets, write 'Timings not available' " +
  "— NEVER omit the field or the pipe separator.\n" +
  "3. If a hospital/clinic name is not found, write 'Location not available'.\n" +
  "4. If a department/specialty is not found, write 'Specialty not available'.\n" +
  "5. List AT LEAST 3 different doctors if the snippets contain them. If " +
  "fewer than 3 genuinely exist in the snippets, list all that are available.\n" +
  "6. Do NOT include ratings, reviews, 'best doctor', 'top rated', 'most " +
  "experienced', or any opinion/endorsement language. Just the four facts.\n" +
  "7. Do NOT invent or guess any name, department, hospital, or timing that " +
  "is not in the snippets.\n" +
  "8. Do NOT include phone numbers in the output.\n" +
  "9. Output the list only — no preamble, no summary sentence, no closing " +
  "remark, no meta-commentary like 'Let me check' or 'Here are the results'. " +
  "Start directly with the first bullet.\n" +
  "10. If nothing real can be extracted from the snippets, reply with exactly " +
  "this sentence and nothing else: No reliable doctor information found.\n\n" +
  "Raw snippets:\n\n";

/**
 * Pass raw Serper snippets to Gemini for cleanup and structuring.
 * Validates output against the expected line format. On malformed output,
 * retries once with a stricter instruction. Returns null when Gemini is
 * unavailable, fails, or produces no valid output after retry — the caller
 * then falls back to the local deterministic formatter.
 */
async function cleanSnippetsWithGemini(rawSnippets: string): Promise<{ cleaned: string | null; quotaExhausted: boolean }> {
  const client = getGeminiClient();
  if (!client) {
    logger.warn("[DoctorLookup] GEMINI_API_KEY not set — using local snippet formatting");
    return { cleaned: null, quotaExhausted: false };
  }

  let quotaExhausted = false;

  const callGemini = async (prompt: string): Promise<string | null> => {
    try {
      const completion = await client.models.generateContent({
        model: GEMINI_CLEANUP_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt + rawSnippets }] }],
        config: {
          temperature: 0.1,
          // Generous cap: thinking tokens count toward maxOutputTokens, and a
          // cleaned multi-doctor list needs a few hundred tokens.
          maxOutputTokens: 2000,
        },
      });
      const text = completion.text ?? "";
      return text.trim().length > 0 ? text.trim() : null;
    } catch (error) {
      console.error('[DoctorLookup] Cleaning failed:', error);
      if (isQuotaExhaustedError(error)) {
        quotaExhausted = true;
      }
      logger.warn("[DoctorLookup] Gemini cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  // ── DIAGNOSTIC: log raw snippets fed into cleanup ──
  console.log("[DoctorLookup:DIAG] ═══ RAW SNIPPETS FED TO GEMINI ═══");
  console.log(rawSnippets);
  console.log("[DoctorLookup:DIAG] ═══ END RAW SNIPPETS ═══");

  // First attempt with standard prompt.
  const firstAttempt = await callGemini(CLEANUP_PROMPT);
  // ── DIAGNOSTIC: log first attempt raw output ──
  console.log("[DoctorLookup:DIAG] ═══ FIRST ATTEMPT RAW OUTPUT ═══");
  console.log(firstAttempt ?? "(null — Gemini returned empty or threw)");
  console.log("[DoctorLookup:DIAG] ═══ END FIRST ATTEMPT ═══");

  if (firstAttempt && isValidCleanedOutput(firstAttempt)) {
    console.log("[DoctorLookup:DIAG] ✅ FIRST ATTEMPT PASSED validation");
    return { cleaned: firstAttempt, quotaExhausted: false };
  }

  // ── DIAGNOSTIC: log first attempt failure detail ──
  if (firstAttempt) {
    const failing = getFailingLines(firstAttempt);
    console.log("[DoctorLookup:DIAG] ❌ FIRST ATTEMPT FAILED validation");
    console.log("[DoctorLookup:DIAG]   Total non-empty lines:", firstAttempt.split("\n").filter(l => l.trim()).length);
    console.log("[DoctorLookup:DIAG]   Failing lines (" + failing.length + "):");
    failing.forEach((l, i) => console.log(`[DoctorLookup:DIAG]     [${i}] "${l}"`));
    logger.warn("[DoctorLookup] Gemini output failed validation — retrying with stricter prompt", {
      preview: firstAttempt.slice(0, 200),
    });
  } else {
    console.log("[DoctorLookup:DIAG] ⚠️ FIRST ATTEMPT returned null — skipping validation");
  }

  const retryAttempt = await callGemini(STRICT_RETRY_PROMPT);
  // ── DIAGNOSTIC: log retry raw output ──
  console.log("[DoctorLookup:DIAG] ═══ RETRY ATTEMPT RAW OUTPUT ═══");
  console.log(retryAttempt ?? "(null — Gemini returned empty or threw)");
  console.log("[DoctorLookup:DIAG] ═══ END RETRY ATTEMPT ═══");

  if (retryAttempt && isValidCleanedOutput(retryAttempt)) {
    console.log("[DoctorLookup:DIAG] ✅ RETRY PASSED validation");
    return { cleaned: retryAttempt, quotaExhausted: false };
  }

  // ── DIAGNOSTIC: log retry failure detail ──
  if (retryAttempt) {
    const failing = getFailingLines(retryAttempt);
    console.log("[DoctorLookup:DIAG] ❌ RETRY FAILED validation");
    console.log("[DoctorLookup:DIAG]   Total non-empty lines:", retryAttempt.split("\n").filter(l => l.trim()).length);
    console.log("[DoctorLookup:DIAG]   Failing lines (" + failing.length + "):");
    failing.forEach((l, i) => console.log(`[DoctorLookup:DIAG]     [${i}] "${l}"`));
  } else {
    console.log("[DoctorLookup:DIAG] ⚠️ RETRY returned null — skipping validation");
  }

  // Both attempts failed validation — return null so caller uses local formatter.
  console.log("[DoctorLookup:DIAG] 🚫 BOTH ATTEMPTS FAILED — returning null to caller");
  logger.warn("[DoctorLookup] Gemini output failed validation after retry — falling back to local formatter");
  return { cleaned: null, quotaExhausted };
}

/**
 * Validates that Gemini's cleaned output matches the expected format:
 * each non-empty line must be a bullet with four pipe-separated fields
 * (Name | Department | Hospital | Timings). Rejects meta-commentary,
 * instruction leakage, stray punctuation, and incomplete lines.
 */
function isValidCleanedOutput(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;

  // Single-line "no results" sentinel is valid.
  if (
    lines.length === 1 &&
    lines[0].toLowerCase().startsWith("no reliable doctor information")
  ) {
    return true;
  }

  // Every line must be a bullet with exactly 4 pipe-separated fields
  // (3 pipe characters): Name | Department | Hospital | Timings.
  const bulletRe = /^-\s+.+\s*\|\s*.+\s*\|\s*.+\s*\|\s*.+$/;
  for (const line of lines) {
    if (!bulletRe.test(line.trim())) return false;
  }

  return true;
}

/**
 * DIAGNOSTIC ONLY — returns the specific lines that fail the 4-field
 * bullet validation. Not used in routing logic, only for console logging.
 */
function getFailingLines(text: string): string[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const bulletRe = /^-\s+.+\s*\|\s*.+\s*\|\s*.+\s*\|\s*.+$/;
  return lines.filter((l) => !bulletRe.test(l.trim()));
}

// ─── Doctor query field extraction (Gemini) ─────────────────────────────────

/** Structured fields pulled out of a free-text doctor-search message. */
export interface DoctorQueryExtraction {
  doctorName?: string;
  department?: string;
  hospitalName?: string;
  areaHint?: string;
  needsClarification: boolean;
  clarifyingQuestion?: string;
}

const EXTRACTION_MODEL = "gemini-3.6-flash";

const EXTRACTION_PROMPT = `You extract structured fields from a Pakistani healthcare app user's message about finding a doctor. Given the user's latest message and recent conversation history, extract:
- doctorName: a specific doctor's name if mentioned, else omit
- department: a medical specialty if mentioned (e.g. Cardiology, Orthopedics), else omit
- hospitalName: a specific hospital/clinic name if mentioned, else omit
- areaHint: a city or area in Pakistan if mentioned anywhere in the message OR recent history, else omit
A search needs AT MINIMUM an areaHint to be useful, AND at least one of doctorName/department.
If areaHint is missing, or BOTH doctorName and department are missing, set needsClarification: true and write a short, friendly clarifyingQuestion asking for exactly what's missing.
Otherwise set needsClarification: false and omit clarifyingQuestion.
Reply with ONLY valid JSON, no other text:
{"doctorName": "...", "department": "...", "hospitalName": "...", "areaHint": "...", "needsClarification": false, "clarifyingQuestion": "..."}
Omit any field that doesn't apply.`;

/** Read a string field off a loosely-parsed object; empty strings become undefined. */
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Recover a JSON object from a Gemini reply. Even at temperature 0 Gemini
 * sometimes wraps the object in markdown fences or prose, or emits bare
 * (unquoted) keys — all of which make JSON.parse throw. Extract the
 * outermost {...} block, repair the common malformed shapes, and parse.
 * Returns null when no object can be recovered.
 */
function parseExtractionReply(reply: string): Record<string, unknown> | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = reply.slice(start, end + 1);

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    // Repair pass — quote single-quoted and bare keys, quote single-quoted
    // values, normalize Python-style literals, drop trailing commas.
    const repaired = candidate
      .replace(/([{,]\s*)'([^']*?)'(\s*:)/g, '$1"$2"$3')
      .replace(/(:\s*)'([^']*?)'/g, '$1"$2"')
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
      .replace(/:\s*True\b/g, ": true")
      .replace(/:\s*False\b/g, ": false")
      .replace(/:\s*None\b/g, ": null")
      .replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(repaired) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

// ─── Stricter retry prompt (used when first Gemini output fails validation) ─

const STRICT_RETRY_PROMPT =
  "CRITICAL FORMATTING INSTRUCTION: You must output ONLY properly formatted " +
  "bullet points. No meta-commentary, no instructions, no template examples, " +
  "no 'Let me check', no 'Here are the results', no colons on their own line, " +
  "no raw data notes like '(no phone in snippet)'.\n\n" +
  "Each line MUST have exactly four fields separated by ' | ' in this order:\n" +
  "1. Doctor name (prefixed with 'Dr. ')\n" +
  "2. Department/specialty (write 'Specialty not available' if unknown)\n" +
  "3. Hospital/clinic name (write 'Location not available' if unknown)\n" +
  "4. Timings (write 'Timings not available' if unknown)\n\n" +
  "Every single line must have exactly three pipe characters separating four " +
  "fields. Never omit a field. List at least 3 doctors. No ratings, no " +
  "opinions.\n\n" +
  "If nothing real can be extracted, reply with exactly: No reliable doctor " +
  "information found.\n\n" +
  "Raw snippets:\n\n";

/**
 * Extract doctorName/department/hospitalName/areaHint from a free-text
 * message plus recent conversation history, using Gemini. Replaces the old
 * behavior of passing the ENTIRE raw sentence as the department.
 *
 * Returns needsClarification with a friendly question when there isn't
 * enough to search accurately — never guesses. When Gemini is unavailable
 * or returns unusable output, falls back to asking for doctor/specialty
 * and city so the user is never shown a garbage search.
 */
export async function extractDoctorQueryFields(
  text: string,
  recentHistory: { role: string; content: string }[]
): Promise<DoctorQueryExtraction> {
  const client = getGeminiClient();
  if (!client) {
    return {
      needsClarification: true,
      clarifyingQuestion:
        "Which doctor or specialty are you looking for, and in which city?",
    };
  }

  try {
    const historyText = recentHistory
      .map((h) => `${h.role}: ${h.content}`)
      .join("\n");
    const prompt = `${EXTRACTION_PROMPT}\n\nRecent conversation:\n${historyText}\n\nLatest message: ${text}`;

    const completion = await client.models.generateContent({
      model: EXTRACTION_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0,
        // Thinking tokens count toward maxOutputTokens — a 200-token cap was
        // almost entirely consumed by thinking, truncating the JSON mid-object.
        maxOutputTokens: 2000,
      },
    });

    const raw = (completion.text ?? "").trim();
    const parsed = parseExtractionReply(raw);
    if (!parsed) {
      logger.warn(
        "[DoctorLookup] Extraction reply was not parseable JSON — asking for clarification",
        { replyPreview: raw.slice(0, 200) }
      );
      return {
        needsClarification: true,
        clarifyingQuestion:
          "Which doctor or specialty are you looking for, and in which city?",
      };
    }
    const extracted: DoctorQueryExtraction = {
      doctorName: asString(parsed.doctorName),
      department: asString(parsed.department),
      hospitalName: asString(parsed.hospitalName),
      areaHint: asString(parsed.areaHint),
      needsClarification: parsed.needsClarification === true,
      clarifyingQuestion: asString(parsed.clarifyingQuestion),
    };

    // Hard safety check: a named-doctor query with no city must ALWAYS
    // ask for location before searching — even if Gemini's extraction
    // incorrectly set needsClarification to false. This prevents raw
    // un-located name searches from reaching the API.
    if (extracted.doctorName && !extracted.areaHint) {
      extracted.needsClarification = true;
      extracted.clarifyingQuestion =
        `Which city are you looking for Dr. ${extracted.doctorName} in?`;
    }

    return extracted;
  } catch (error) {
    console.error("[DoctorLookup] Extraction failed:", error);
    if (isQuotaExhaustedError(error)) {
      return {
        needsClarification: true,
        clarifyingQuestion: QUOTA_EXHAUSTED_MESSAGE,
      };
    }
    return {
      needsClarification: true,
      clarifyingQuestion:
        "Which doctor or specialty are you looking for, and in which city?",
    };
  }
}

// ─── Local fallback formatting (no LLM) ─────────────────────────────────────

/**
 * Search-engine UI fragments that must never reach the chat UI — stripped
 * wherever they appear inside titles and snippets.
 */
const BOILERPLATE_PHRASES_RE =
  /\b(?:read more|learn more|see more|show more|view profile|visit (?:website|page|us)|sign in|sign ?up|log ?in|register|download(?: the)? app|book (?:an )?appointment (?:online|now)|call now|get directions|contact us)\b/gi;

/** Related-question headings, e.g. "Who is the best cardiologist in Karachi?" */
const QUERY_SHAPE_RE = /[?؟]\s*$/;

/** Strip boilerplate phrases, ellipses, and orphaned separators from a title/snippet. */
function sanitizeSnippetText(text: string): string {
  return text
    .replace(BOILERPLATE_PHRASES_RE, " ")
    .replace(/\.{2,}/g, "")
    .replace(/…/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—|·:,]+/, "")
    .replace(/[\s\-–—|·:,]+$/, "")
    .trim();
}

/** Standard "nothing usable came back from the search" result. */
function noResults(): DoctorLookupResult {
  return {
    found: false,
    summary_text:
      "No results found for this search. Try a different department or area.",
    disclaimer: SEARCH_DISCLAIMER,
    source: "serper_web_search",
  };
}

/**
 * Deterministic fallback used when Gemini is unavailable, fails, or returns
 * nothing: formats the organic results into clean bullets locally so raw
 * search-engine boilerplate never reaches the user.
 */
function formatOrganicLocally(
  organic: NonNullable<SerperResponse["organic"]>
): string {
  const seen = new Set<string>();
  const bullets: string[] = [];

  for (const r of organic) {
    const title = sanitizeSnippetText(r.title ?? "");
    const snippet = sanitizeSnippetText(r.snippet ?? "");
    if (!title && !snippet) continue;

    // Skip query-shaped headings ("Who is the best cardiologist in Karachi?")
    // and bare URLs — neither carries doctor/hospital facts.
    if (QUERY_SHAPE_RE.test(title)) continue;
    if (title && !/\s/.test(title) && /\.(com|pk|net|org|io)(\/|$)/i.test(title)) {
      continue;
    }

    // Deduplicate the same page heading appearing across snippets.
    const key = (title || snippet)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    if (title && snippet && title !== snippet) {
      bullets.push(`- ${title} | ${snippet}`);
    } else {
      bullets.push(`- ${title || snippet}`);
    }
  }

  return bullets.join("\n");
}

/**
 * When the query included a specific doctorName and the result has multiple
 * doctors, separate the matching doctor from others and insert a dynamic
 * department header before the extras. Only applies to named-doctor queries —
 * pure department-browse queries keep the flat list unchanged.
 */
function postProcessDoctorList(
  summaryText: string,
  params: DoctorLookupParams
): string {
  if (!params.doctorName) return summaryText;

  const lines = summaryText.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return summaryText;

  const nameLower = params.doctorName.toLowerCase();
  const matching: string[] = [];
  const others: string[] = [];

  for (const line of lines) {
    if (line.toLowerCase().includes(nameLower)) {
      matching.push(line);
    } else {
      others.push(line);
    }
  }

  // Only add header when there are extras beyond the named doctor.
  if (matching.length === 0 || others.length === 0) return summaryText;

  const dept = params.department ?? "specialty";
  const header = `\nOther ${dept} doctors:`;
  return [...matching, header, "", ...others].join("\n");
}

export async function lookupDoctors(
  params: DoctorLookupParams
): Promise<DoctorLookupResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    logger.warn("[DoctorLookup] SERPER_API_KEY not set — feature unavailable");
    return {
      found: false,
      summary_text:
        "Doctor lookup is not available right now. Please search manually " +
        "or ask hospital reception directly.",
      disclaimer: SEARCH_DISCLAIMER,
      source: "unavailable",
    };
  }

  try {
    const query = params.doctorName
      ? `${params.doctorName} doctor ${params.department ?? ""} hospital ${params.areaHint} Pakistan practicing hours`
      : `${params.department} specialists ${params.hospitalName ?? ""} ${params.areaHint} Pakistan hospital timings`;

    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, gl: "pk", hl: "en" }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      logger.error(`[DoctorLookup] Serper API returned ${res.status}`, { errorBody });
      return {
        found: false,
        summary_text: "Doctor lookup failed. Please try again or search manually.",
        disclaimer: SEARCH_DISCLAIMER,
        source: "unavailable",
      };
    }

    const data: SerperResponse = await res.json();
    const organic = data.organic;

    if (!organic || organic.length === 0) {
      return noResults();
    }

    // Combine top organic results into the raw snippet payload for Gemini.
    // Use up to 8 organic results to maximise coverage for a 3+ doctor listing.
    const MAX_RESULTS = 8;
    const top = organic.slice(0, MAX_RESULTS);
    const rawSnippets = top
      .map((r) => {
        const title = r.title ?? "";
        const snippet = r.snippet ?? "";
        return title ? `${title}\n${snippet}` : snippet;
      })
      .filter(Boolean)
      .join("\n\n");

    if (!rawSnippets) return noResults();

    // ── Clean and structure via Gemini; local formatter as safe fallback ──
    const { cleaned, quotaExhausted } = await cleanSnippetsWithGemini(rawSnippets);

    // Gemini reports the snippets held only boilerplate — treat as no results.
    if (
      cleaned &&
      cleaned.toLowerCase().startsWith("no reliable doctor information")
    ) {
      return noResults();
    }

    // When Gemini produced valid output, use it directly.
    if (cleaned) {
      return {
        found: true,
        summary_text: postProcessDoctorList(cleaned, params),
        disclaimer: SEARCH_DISCLAIMER,
        source: "serper_web_search",
      };
    }

    // Gemini unavailable or failed validation — use local deterministic
    // formatter (boilerplate stripped, deduped). Validate its output too
    // so malformed text never reaches the user.
    const localFormatted = formatOrganicLocally(top);
    if (localFormatted && isValidCleanedOutput(localFormatted)) {
      return {
        found: true,
        summary_text: postProcessDoctorList(localFormatted, params),
        disclaimer: SEARCH_DISCLAIMER,
        source: "serper_web_search",
      };
    }

    // Local formatter also couldn't produce clean output — honest fallback.
    // If quota exhaustion caused the Gemini failures, tell the user honestly
    // rather than showing a misleading "couldn't find results" message.
    return {
      found: false,
      summary_text: quotaExhausted
        ? QUOTA_EXHAUSTED_MESSAGE
        : "Couldn't find clean results for this search — please try rephrasing or search manually.",
      disclaimer: SEARCH_DISCLAIMER,
      source: "serper_web_search",
    };
  } catch (error) {
    logger.error("[DoctorLookup] Serper search failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      found: false,
      summary_text: "Doctor lookup failed. Please try again or search manually.",
      disclaimer: SEARCH_DISCLAIMER,
      source: "unavailable",
    };
  }
}
