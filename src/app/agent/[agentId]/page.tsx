/**
 * Dynamic agent route — /agent/[agentId]
 *
 * Looks up the agent by ID from the registry and renders the shared
 * AgentChatShell. Returns 404 for unknown agent IDs.
 *
 * Must be a Client Component because AgentConfig carries Lucide icon
 * components (functions) which cannot be passed from Server Components
 * to Client Components as props in Next.js App Router.
 */

"use client";

import { notFound } from "next/navigation";
import { getAgentById } from "@/lib/agents/agentConfig";
import AgentChatShell from "@/components/chat/AgentChatShell";

export default function AgentPage({
  params,
}: {
  params: { agentId: string };
}) {
  const agent = getAgentById(params.agentId);
  if (!agent) return notFound();
  return <AgentChatShell agent={agent} />;
}
