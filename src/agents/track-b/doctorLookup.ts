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
 * Prompt for cleaning raw Serper snippets into a readable doctor listing.
 * Strictly grounded — Gemini may only reformat what the snippets contain,
 * never invent doctors, timings, or phone numbers. Duplicates are merged,
 * search-engine boilerplate is discarded, and the output is a plain
 * bulleted list limited to the five canonical fields.
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
  "OUTPUT FORMAT — a plain bulleted list, one bullet per doctor or hospital, " +
  "exactly in this shape:\n" +
  "- Dr. Name — Specialty | Hospital/Clinic, City | Days & Timings | Phone\n\n" +
  "STRICT RULES:\n" +
  "1. Each bullet may contain ONLY these fields, in this order: Doctor " +
  "Name, Specialty, Hospital/Clinic Location, Timings/Days, Contact Number.\n" +
  "2. If any field is missing or uncertain, OMIT it silently — no 'N/A', no " +
  "placeholder, no ellipsis, no broken text.\n" +
  "3. Do NOT invent or guess any name, specialty, timing, phone number, or " +
  "address that is not in the snippets.\n" +
  "4. Output the list only — no preamble, no summary sentence, no closing " +
  "remark. Start directly with the first bullet.\n" +
  "5. If nothing real can be extracted from the snippets, reply with exactly " +
  "this sentence and nothing else: No reliable doctor information found.\n\n" +
  "Raw snippets:\n\n";

/**
 * Pass raw Serper snippets to Gemini for cleanup and structuring.
 * Returns null when Gemini is unavailable or fails — the caller then falls
 * back to the local deterministic formatter, NEVER to the raw snippets.
 */
async function cleanSnippetsWithGemini(rawSnippets: string): Promise<string | null> {
  const client = getGeminiClient();
  if (!client) {
    logger.warn("[DoctorLookup] GEMINI_API_KEY not set — using local snippet formatting");
    return null;
  }

  try {
    const completion = await client.models.generateContent({
      model: GEMINI_CLEANUP_MODEL,
      contents: [{ role: "user", parts: [{ text: CLEANUP_PROMPT + rawSnippets }] }],
      config: {
        temperature: 0.1,
        // Generous cap: thinking tokens count toward maxOutputTokens, and a
        // cleaned 5-doctor list itself needs a few hundred tokens.
        maxOutputTokens: 2000,
      },
    });

    const text = completion.text ?? "";
    return text.trim().length > 0 ? text.trim() : null;
  } catch (error) {
    console.error('[DoctorLookup] Cleaning failed:', error);
    logger.warn("[DoctorLookup] Gemini cleanup failed — using local snippet formatting", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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
    return {
      doctorName: asString(parsed.doctorName),
      department: asString(parsed.department),
      hospitalName: asString(parsed.hospitalName),
      areaHint: asString(parsed.areaHint),
      needsClarification: parsed.needsClarification === true,
      clarifyingQuestion: asString(parsed.clarifyingQuestion),
    };
  } catch (error) {
    console.error("[DoctorLookup] Extraction failed:", error);
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
      bullets.push(`- ${title} — ${snippet}`);
    } else {
      bullets.push(`- ${title || snippet}`);
    }
  }

  return bullets.join("\n");
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
      ? `${params.doctorName} doctor ${params.department} hospital ${params.areaHint} Pakistan practicing hours`
      : `best ${params.department} specialists ${params.hospitalName ?? ""} ${params.areaHint} Pakistan hospital timings`;

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
    const MAX_RESULTS = 5;
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
    const cleaned = await cleanSnippetsWithGemini(rawSnippets);

    // Gemini reports the snippets held only boilerplate — treat as no results.
    if (
      cleaned &&
      cleaned.toLowerCase().startsWith("no reliable doctor information")
    ) {
      return noResults();
    }

    // NEVER surface raw snippets: when Gemini is unavailable or fails, format
    // the organic results locally instead (boilerplate stripped, deduped).
    const summary_text = cleaned ?? formatOrganicLocally(top);

    if (!summary_text) return noResults();

    return {
      found: true,
      summary_text,
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
