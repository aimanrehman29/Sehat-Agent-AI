/**
 * Sehat-Assist AI — Agent Hub Homepage.
 *
 * This is the navigation hub where all 6 agents are visible and tappable,
 * with the Orchestrator living as its own persistent footer option.
 * No chat state lives here — every conversation happens on /agent/[agentId].
 *
 * Brand palette:
 *   - Pistachio (#CAF0C1) icon backgrounds
 *   - Forest Green (#015D67) headers
 *   - Kelly Green (#00ACB1) main Orchestrator button
 */

"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { AGENTS, ORCHESTRATOR_AGENT } from "@/lib/agents/agentConfig";

export default function HubPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col h-[100dvh] bg-brand-g2">
      {/* ── Header — logo + name, safe-area for the notch ── */}
      <header
        className="flex-none bg-white border-b px-4 pb-4 flex items-center gap-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
      >
        <Image
          src="/logo.png"
          alt="Sehat-Assist AI"
          width={36}
          height={36}
          priority
        />
        <div>
          <h1 className="text-lg font-semibold text-brand-forest">
            Sehat-Assist AI
          </h1>
          <p className="text-xs text-brand-g56">Your health, one tap away</p>
        </div>
      </header>

      {/* ── Scrollable agent grid — the only part that scrolls ── */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <p className="text-xs font-medium text-brand-g56 uppercase tracking-wide mb-3">
          Choose an assistant
        </p>
        <div className="grid grid-cols-2 gap-3">
          {AGENTS.map((agent) => {
            const Icon = agent.icon;
            return (
              <button
                key={agent.id}
                onClick={() => router.push(`/agent/${agent.id}`)}
                className="flex flex-col items-start gap-2 bg-white border border-brand-g16 rounded-2xl p-4 min-h-[44px] text-left
                           shadow-sm active:scale-[0.98] transition-transform"
              >
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: "#CAF0C1" }}
                >
                  <Icon size={20} color="#015D67" />
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {agent.name}
                </span>
                <span className="text-xs text-brand-g56 leading-snug">
                  {agent.tagline}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Fixed footer — the Orchestrator, always reachable, visually distinct ── */}
      <div
        className="flex-none bg-white border-t border-brand-g16 px-4 pt-3 flex justify-center"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <button
          onClick={() => router.push("/agent/orchestrator")}
          className="w-full max-w-sm flex items-center justify-center gap-2 rounded-full min-h-[48px] text-white
                     text-sm font-semibold"
          style={{ backgroundColor: "#00ACB1" }}
        >
          <ORCHESTRATOR_AGENT.icon size={18} />
          Talk to Sehat-Assist
        </button>
      </div>
    </div>
  );
}
