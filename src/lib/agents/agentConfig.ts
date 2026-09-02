/**
 * Agent registry — single source of truth for the Agent Hub.
 *
 * Every icon on the hub, every chat header, and every routing decision reads
 * from this one array so nothing gets hardcoded twice.
 */

import type { LucideIcon } from "lucide-react";
import {
  ScanBarcode,
  FlaskConical,
  Pill,
  Stethoscope,
  MapPin,
  CalendarCheck,
  Sparkles,
} from "lucide-react";

export type EndpointMode = "direct" | "orchestrator";

export interface AgentConfig {
  /** Used in the /agent/[agentId] URL. */
  id: string;
  /** Shown in tile + chat header. */
  name: string;
  /** One line on the hub tile. */
  tagline: string;
  icon: LucideIcon;
  /** Hex, from brand tokens only. */
  accent: string;
  /** "direct" hits its own API route; "orchestrator" goes through /api/orchestrator. */
  endpointMode: EndpointMode;
  /** Required when endpointMode === "direct". */
  directEndpoint?: string;
  /** Shows the paperclip/camera button in chat. */
  acceptsUpload: boolean;
  /** Input placeholder text for this agent's chat. */
  placeholder: string;
}

export const AGENTS: AgentConfig[] = [
  {
    id: "pharma-check",
    name: "Pharma-Check",
    tagline: "Spot fake medicines",
    icon: ScanBarcode,
    accent: "#00ACB1",
    endpointMode: "direct",
    directEndpoint: "/api/track-a/pharma-check",
    acceptsUpload: true,
    placeholder: "Describe the medicine, or attach a photo of the box/QR code",
  },
  {
    id: "lingo-med",
    name: "Lingo-Med",
    tagline: "Understand your lab report",
    icon: FlaskConical,
    accent: "#00ACB1",
    endpointMode: "direct",
    directEndpoint: "/api/track-a/lingo-med",
    acceptsUpload: true,
    placeholder: "Attach your lab report, or ask about a result",
  },
  {
    id: "care-sync",
    name: "Care-Sync",
    tagline: "Turn prescriptions into reminders",
    icon: Pill,
    accent: "#00ACB1",
    endpointMode: "direct",
    directEndpoint: "/api/track-a/care-sync/parse",
    acceptsUpload: true,
    placeholder: "Attach your prescription, or type your medicines",
  },
  {
    id: "triage",
    name: "Triage",
    tagline: "Which department do I need?",
    icon: Stethoscope,
    accent: "#015D67",
    endpointMode: "orchestrator",
    acceptsUpload: false,
    placeholder: "Describe how you feel...",
  },
  {
    id: "geo-locator",
    name: "Find a Hospital",
    tagline: "Nearby facilities, live directions",
    icon: MapPin,
    accent: "#015D67",
    endpointMode: "orchestrator",
    acceptsUpload: false,
    placeholder: "e.g. nearest hospital with a cardiologist",
  },
  {
    id: "auto-booking",
    name: "Book an Appointment",
    tagline: "Schedule a visit automatically",
    icon: CalendarCheck,
    accent: "#015D67",
    endpointMode: "orchestrator",
    acceptsUpload: false,
    placeholder: "Which doctor or clinic would you like to book?",
  },
];

export const ORCHESTRATOR_AGENT: AgentConfig = {
  id: "orchestrator",
  name: "Sehat-Assist AI",
  tagline: "Ask me anything, I'll route it",
  icon: Sparkles,
  accent: "#00ACB1",
  endpointMode: "orchestrator",
  acceptsUpload: true,
  placeholder: "Describe how you feel, or ask a question...",
};

export function getAgentById(id: string): AgentConfig | undefined {
  if (id === "orchestrator") return ORCHESTRATOR_AGENT;
  return AGENTS.find((a) => a.id === id);
}
