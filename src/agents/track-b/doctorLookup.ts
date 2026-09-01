import { GoogleGenerativeAI } from "@google/generative-ai";
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
  source: "gemini_grounded_search" | "unavailable";
}

const SEARCH_DISCLAIMER =
  "This information comes from a live web search and may be out of date. " +
  "Please confirm timings directly with the hospital before visiting.";

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

export async function lookupDoctors(
  params: DoctorLookupParams
): Promise<DoctorLookupResult> {
  const client = getClient();
  if (!client) {
    logger.warn("[DoctorLookup] GEMINI_API_KEY not set - feature unavailable");
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
    const model = client.getGenerativeModel({
      model: "gemini-2.0-flash",
      // @ts-expect-error -- googleSearch grounding tool, not yet in the
      // stable TS types as of this SDK version; verify against the
      // installed @google/generative-ai version and adjust if needed.
      tools: [{ googleSearch: {} }],
    });

    const query = params.doctorName
      ? `${params.doctorName} doctor ${params.department} hospital ${params.areaHint} Pakistan practicing hours`
      : `best ${params.department} specialists ${params.hospitalName ?? ""} ${params.areaHint} Pakistan hospital timings`;

    const result = await model.generateContent(query);
    const text = result.response.text();

    if (!text || text.trim().length === 0) {
      return {
        found: false,
        summary_text: "No results found for this search. Try a different department or area.",
        disclaimer: SEARCH_DISCLAIMER,
        source: "gemini_grounded_search",
      };
    }

    return {
      found: true,
      summary_text: text.trim(),
      disclaimer: SEARCH_DISCLAIMER,
      source: "gemini_grounded_search",
    };
  } catch (error) {
    logger.error("[DoctorLookup] Gemini search failed", {
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
