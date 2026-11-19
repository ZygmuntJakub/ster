import type { AgentSource, SourceContext } from "../extensions/index.js";
import type { Agent } from "./agent.js";

/**
 * Merge AgentSource extension candidates into Agent records (FR-059).
 */
export async function listExtensionAgents(
  sources: ReadonlyArray<AgentSource>,
  ctx: SourceContext,
): Promise<Agent[]> {
  const agents: Agent[] = [];
  for (const source of sources) {
    const candidates = await source.list(ctx);
    for (const candidate of candidates) {
      const agent: Agent = {
        id: candidate.id,
        name: candidate.name,
        origin: "custom",
        distribution: "none",
        readiness: candidate.launch ? "ready" : "not-installed",
        ...(candidate.version !== undefined ? { version: candidate.version } : {}),
        ...(candidate.launch !== undefined ? { launch: candidate.launch } : {}),
      };
      agents.push(agent);
    }
  }
  return agents;
}
