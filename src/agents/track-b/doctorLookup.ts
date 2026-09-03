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
      return {
        found: false,
        summary_text: "No results found for this search. Try a different department or area.",
        disclaimer: SEARCH_DISCLAIMER,
        source: "serper_web_search",
      };
    }

    // Combine top organic results into a readable summary.
    const MAX_RESULTS = 5;
    const lines = organic.slice(0, MAX_RESULTS).map((r) => {
      const title = r.title ?? "";
      const snippet = r.snippet ?? "";
      return title ? `${title}\n${snippet}` : snippet;
    });

    const summary_text = lines.filter(Boolean).join("\n\n");

    return {
      found: summary_text.length > 0,
      summary_text: summary_text || "No results found for this search. Try a different department or area.",
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
