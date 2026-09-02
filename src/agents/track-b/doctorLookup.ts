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
  source: "gemini_grounded_search" | "unavailable";
}

const SEARCH_DISCLAIMER =
  "This information comes from a live web search and may be out of date. " +
  "Please confirm timings directly with the hospital before visiting.";

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenAI({ apiKey });
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
    const query = params.doctorName
      ? `${params.doctorName} doctor ${params.department} hospital ${params.areaHint} Pakistan practicing hours`
      : `best ${params.department} specialists ${params.hospitalName ?? ""} ${params.areaHint} Pakistan hospital timings`;

    const interaction = await client.interactions.create({
      model: "gemini-3.6-flash",
      input: query,
      tools: [{ type: "google_search" }],
    });

    const text = interaction.output_text ?? "";

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
