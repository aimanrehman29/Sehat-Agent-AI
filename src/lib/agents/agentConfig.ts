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
  /** Urdu translation of name (optional, shown when lang === "ur"). */
  nameUr?: string;
  /** One line on the hub tile. */
  tagline: string;
  /** Urdu translation of tagline (optional). */
  taglineUr?: string;
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
  /** Urdu translation of placeholder (optional). */
  placeholderUr?: string;
  /** Example starter prompts shown in the empty state. */
  examplePrompts?: string[];
  /** Urdu translations of examplePrompts (optional). */
  examplePromptsUr?: string[];
}

export const AGENTS: AgentConfig[] = [
  {
    id: "pharma-check",
    name: "Pharma-Check",
    nameUr: "\u0641\u0627\u0631\u0645\u0627 \u0686\u06cc\u06a9",
    tagline: "Spot fake medicines",
    taglineUr: "\u062c\u0639\u0644\u06cc \u0627\u062f\u0648\u06cc\u0627\u062a \u06a9\u06cc \u0646\u0634\u0627\u0646\u062f\u06c1\u06cc \u06a9\u0631\u06cc\u06ba",
    icon: ScanBarcode,
    accent: "#00ACB1",
    endpointMode: "direct",
    directEndpoint: "/api/track-a/pharma-check",
    acceptsUpload: true,
    placeholder: "Describe the medicine, or attach a photo of the box/QR code",
    placeholderUr: "\u062f\u0648\u0627 \u06a9\u06cc \u062a\u0641\u0635\u06cc\u0644 \u0628\u062a\u0627\u0626\u06cc\u06ba\u060c \u06cc\u0627 \u0688\u0628\u06d2/QR \u06a9\u0648\u0688 \u06a9\u06cc \u062a\u0635\u0648\u06cc\u0631 \u0645\u0646\u0633\u0644\u06a9 \u06a9\u0631\u06cc\u06ba",
    examplePrompts: ["Is this medicine genuine?", "Can these two medicines be taken together?"],
    examplePromptsUr: ["\u06cc\u06c1 \u062f\u0648\u0627 \u062c\u0639\u0644\u06cc \u062a\u0648 \u0646\u06c1\u06cc\u06ba\u061f", "\u06a9\u06cc\u0627 \u06cc\u06c1 \u062f\u0648 \u0627\u062f\u0648\u06cc\u0627\u062a \u0633\u0627\u062a\u06be \u0644\u06cc \u062c\u0627 \u0633\u06a9\u062a\u06cc \u06c1\u06cc\u06ba\u061f"],
  },
  {
    id: "lingo-med",
    name: "Lingo-Med",
    nameUr: "\u0644\u06cc\u0646\u06af\u0648 \u0645\u06cc\u0688",
    tagline: "Understand your lab report",
    taglineUr: "\u0627\u067e\u0646\u06cc \u0644\u06cc\u0628 \u0631\u06cc\u067e\u0648\u0631\u0679 \u0633\u0645\u062c\u06be\u06cc\u06ba",
    icon: FlaskConical,
    accent: "#00ACB1",
    endpointMode: "direct",
    directEndpoint: "/api/track-a/lingo-med",
    acceptsUpload: true,
    placeholder: "Attach your lab report, or ask about a result",
    placeholderUr: "\u0627\u067e\u0646\u06cc \u0644\u06cc\u0628 \u0631\u06cc\u067e\u0648\u0631\u0679 \u0645\u0646\u0633\u0644\u06a9 \u06a9\u0631\u06cc\u06ba\u060c \u06cc\u0627 \u06a9\u0633\u06cc \u0646\u062a\u06cc\u062c\u06d2 \u06a9\u06d2 \u0628\u0627\u0631\u06d2 \u0645\u06cc\u06ba \u067e\u0648\u0686\u06be\u06cc\u06ba",
    examplePrompts: ["Explain my lab report", "What does high sugar level mean?"],
    examplePromptsUr: ["\u0645\u06cc\u0631\u06cc \u0644\u06cc\u0628 \u0631\u067e\u0648\u0631\u0679 \u06a9\u0627 \u0645\u0637\u0644\u0628 \u0628\u062a\u0627\u0626\u06cc\u06ba", "\u0634\u0648\u06af\u0631 \u0644\u06cc\u0648\u0644 \u0632\u06cc\u0627\u062f\u06c1 \u06c1\u0648\u0646\u06d2 \u06a9\u0627 \u06a9\u06cc\u0627 \u0645\u0637\u0644\u0628 \u06c1\u06d2\u061f"],
  },
  {
    id: "care-sync",
    name: "Care-Sync",
    nameUr: "\u06a9\u06cc\u0626\u0631 \u0633\u06cc\u0646\u06a9",
    tagline: "Turn prescriptions into reminders",
    taglineUr: "\u0646\u0633\u062e\u0648\u06ba \u06a9\u0648 \u06cc\u0627\u062f\u06c1\u062f\u06c1\u0627\u0646\u06cc \u0645\u06cc\u06ba \u0628\u062f\u0644\u06cc\u06ba",
    icon: Pill,
    accent: "#00ACB1",
    endpointMode: "direct",
    directEndpoint: "/api/track-a/care-sync/parse",
    acceptsUpload: true,
    placeholder: "Attach your prescription, or type your medicines",
    placeholderUr: "\u0627\u067e\u0646\u0627 \u0646\u0633\u062e\u06c1 \u0645\u0646\u0633\u0644\u06a9 \u06a9\u0631\u06cc\u06ba\u060c \u06cc\u0627 \u0627\u067e\u0646\u06cc \u062f\u0648\u0627\u0626\u06cc\u06ba \u0644\u06a9\u06be\u06cc\u06ba",
    examplePrompts: ["Set a reminder for my prescription", "Create a schedule for my medicines"],
    examplePromptsUr: ["\u0645\u06cc\u0631\u06d2 \u0646\u0633\u062e\u06d2 \u06a9\u06cc \u06cc\u0627\u062f \u062f\u06c1\u0627\u0646\u06cc \u0628\u0646\u0627\u0626\u06cc\u06ba", "\u0645\u06cc\u0631\u06cc \u062f\u0648\u0627\u0626\u06cc\u0648\u06ba \u06a9\u0627 \u0634\u06cc\u0688\u0648\u0644 \u0628\u0646\u0627\u0626\u06cc\u06ba"],
  },
  {
    id: "triage",
    name: "Triage",
    nameUr: "\u0679\u0631\u06cc\u0627\u062c",
    tagline: "Which department do I need?",
    taglineUr: "\u0622\u067e \u06a9\u0648 \u06a9\u0633 \u0645\u062d\u06a9\u0645\u06d2 \u06a9\u06cc \u0636\u0631\u0648\u0631\u062a \u06c1\u06d2\u061f",
    icon: Stethoscope,
    accent: "#015D67",
    endpointMode: "orchestrator",
    acceptsUpload: false,
    placeholder: "Describe how you feel...",
    placeholderUr: "\u0628\u062a\u0627\u0626\u06cc\u06ba \u0622\u067e \u06a9\u06cc\u0633\u0627 \u0645\u062d\u0633\u0648\u0633 \u06a9\u0631 \u0631\u06c1\u06d2 \u06c1\u06cc\u06ba...",
    examplePrompts: ["I have a headache", "I have chest pain"],
    examplePromptsUr: ["\u0645\u062c\u06be\u06d2 \u0633\u0631 \u062f\u0631\u062f \u06c1\u06d2", "\u0645\u062c\u06be\u06d2 \u0633\u06cc\u0646\u06d2 \u0645\u06cc\u06ba \u062f\u0631\u062f \u06c1\u06d2"],
  },
  {
    id: "geo-locator",
    name: "Find a Hospital",
    nameUr: "\u06c1\u0633\u067e\u062a\u0627\u0644 \u062a\u0644\u0627\u0634 \u06a9\u0631\u06cc\u06ba",
    tagline: "Nearby facilities, live directions",
    taglineUr: "\u0642\u0631\u06cc\u0628\u06cc \u0633\u06c1\u0648\u0644\u06cc\u0627\u062a\u060c \u0628\u0631\u0627\u06c1 \u0631\u0627\u0633\u062a\u06c1 \u06c1\u062f\u0627\u06cc\u062a",
    icon: MapPin,
    accent: "#015D67",
    endpointMode: "orchestrator",
    acceptsUpload: false,
    placeholder: "e.g. nearest hospital with a cardiologist",
    placeholderUr: "\u0645\u062b\u0627\u0644\u0627\u064b \u0642\u0631\u06cc\u0628\u06cc \u06c1\u0633\u067e\u062a\u0627\u0644 \u062c\u0633 \u0645\u06cc\u06ba \u062f\u0644 \u06a9\u06d2 \u0645\u0627\u06c1\u0631 \u06c1\u0648\u06ba",
    examplePrompts: ["Show me nearby hospitals", "Nearest hospital with a cardiologist"],
    examplePromptsUr: ["\u0642\u0631\u06cc\u0628\u06cc \u06c1\u0633\u067e\u062a\u0627\u0644 \u0628\u062a\u0627\u0626\u06cc\u06ba", "\u062f\u0644 \u06a9\u06d2 \u0645\u0627\u06c1\u0631 \u06a9\u06d2 \u0633\u0627\u062a\u06be \u0642\u0631\u06cc\u0628\u06cc \u06c1\u0633\u067e\u062a\u0627\u0644"],
  },
  {
    id: "auto-booking",
    name: "Book an Appointment",
    nameUr: "\u0627\u06cc\u067e\u0627\u0626\u0646\u0679\u0645\u06cc\u0646\u0679 \u06a9\u0631\u0627\u0626\u06cc\u06ba",
    tagline: "Schedule a visit automatically",
    taglineUr: "\u062e\u0648\u062f\u06a9\u0627\u0631 \u0637\u0648\u0631 \u067e\u0631 \u062f\u0648\u0631\u06c1 \u06a9\u0627 \u0648\u0642\u062a \u0645\u062d\u0641\u0648\u0638 \u06a9\u0631\u0627\u0626\u06cc\u06ba",
    icon: CalendarCheck,
    accent: "#015D67",
    endpointMode: "orchestrator",
    acceptsUpload: false,
    placeholder: "Which doctor or clinic would you like to book?",
    placeholderUr: "\u0622\u067e \u06a9\u0633 \u0688\u0627\u06a9\u0679\u0631 \u06cc\u0627 \u06a9\u0644\u06cc\u0646\u06a9 \u06a9\u0627 \u0648\u0642\u062a \u0645\u062d\u0641\u0648\u0638 \u06a9\u0631\u0627\u0646\u0627 \u0686\u0627\u06c1\u062a\u06d2 \u06c1\u06cc\u06ba\u061f",
    examplePrompts: ["Book a doctor's appointment", "I need an appointment at a nearby clinic"],
    examplePromptsUr: ["\u0688\u0627\u06a9\u0679\u0631 \u0633\u06d2 \u0645\u0644\u0627\u0642\u0627\u062a \u06a9\u0627 \u0648\u0642\u062a \u0645\u062d\u0641\u0648\u0638 \u06a9\u0631\u06cc\u06ba", "\u0642\u0631\u06cc\u0628\u06cc \u06a9\u0644\u06cc\u0646\u06a9 \u0645\u06cc\u06ba \u0627\u067e\u0627\u0626\u0646\u0679\u0645\u0646\u0679 \u0686\u0627\u06c1\u06cc\u06d2"],
  },
];

export const ORCHESTRATOR_AGENT: AgentConfig = {
  id: "orchestrator",
  name: "Sehat-Assist AI",
  nameUr: "\u0633\u06c1\u062a \u0627\u0633\u0633\u0679 \u0627\u06cc\u0622\u0626\u06cc",
  tagline: "Ask me anything, I'll route it",
  taglineUr: "\u0645\u062c\u06be\u0633\u06d2 \u06a9\u0686\u06be \u0628\u06be\u06cc \u067e\u0648\u0686\u06be\u06cc\u06ba\u060c \u0645\u06cc\u06ba \u0631\u0627\u0633\u062a\u06c1 \u062f\u06a9\u06be\u0627\u0624\u0646\u06af\u0627",
  icon: Sparkles,
  accent: "#00ACB1",
  endpointMode: "orchestrator",
  acceptsUpload: true,
  placeholder: "Describe how you feel, or ask a question...",
  placeholderUr: "\u0628\u062a\u0627\u0626\u06cc\u06ba \u0622\u067e \u06a9\u06cc\u0633\u0627 \u0645\u062d\u0633\u0648\u0633 \u06a9\u0631 \u0631\u06c1\u06d2 \u06c1\u06cc\u06ba\u060c \u06cc\u0627 \u06a9\u0648\u0626\u06cc \u0633\u0648\u0627\u0644 \u06a9\u0631\u06cc\u06ba...",
  examplePrompts: ["I have a fever, what should I do?", "Which department handles headaches?"],
  examplePromptsUr: ["\u0645\u062c\u06be\u06d2 \u0628\u062e\u0627\u0631 \u06c1\u06d2\u060c \u06a9\u06cc\u0627 \u06a9\u0631\u0648\u06ba\u061f", "\u0633\u0631 \u062f\u0631\u062f \u06a9\u06d2 \u0644\u06cc\u06d2 \u06a9\u0648\u0646 \u0633\u0627 \u0645\u062d\u06a9\u0645\u06c1 \u06c1\u06d2\u061f"],
};

export function getAgentById(id: string): AgentConfig | undefined {
  if (id === "orchestrator") return ORCHESTRATOR_AGENT;
  return AGENTS.find((a) => a.id === id);
}
