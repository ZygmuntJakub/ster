import { methods } from "@agentclientprotocol/sdk";
import { connectAgent, type AcpConnection } from "../acp/connection.js";
import { spawnAgentProcess, type AgentProcess } from "../acp/process.js";
import type { AgentService } from "../agents/service.js";
import { SterError } from "../errors.js";
import type { FactoryService } from "../factory/service.js";
import type { Logger } from "../log.js";
import type { PolicyService } from "../policy/service.js";
import type { ResolvedEnv } from "../platform/shell-env.js";
import { finalizeRun, startRun, type RunRecord, type RunScore } from "./lifecycle.js";
import { createAgentScore } from "./scores.js";

export interface JudgeRunOptions {
  run: RunRecord;
  agentId: string;
  agents: AgentService;
  policy: PolicyService;
  factory: FactoryService;
  environment: ResolvedEnv;
  log: Logger;
  persistRun: (run: RunRecord) => void;
  persistScore: (score: RunScore) => void;
}

interface ParsedJudgeResult {
  value: number;
  reasoning?: string;
  criteria?: Array<{ id: string; value: number }>;
  model?: string;
}

/**
 * Lenient JSON extraction from judging agent output (research.md R15).
 */
export function parseJudgeResponse(text: string): ParsedJudgeResult | null {
  const trimmed = text.trim();
  const candidates: string[] = [];
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    candidates.push(trimmed);
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }
  const embedded = /\{[\s\S]*\}/.exec(trimmed);
  if (embedded?.[0]) {
    candidates.push(embedded[0]);
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const value =
        typeof parsed.value === "number"
          ? parsed.value
          : typeof parsed.score === "number"
            ? parsed.score
            : null;
      if (value === null) {
        continue;
      }
      const result: ParsedJudgeResult = { value };
      if (typeof parsed.reasoning === "string") {
        result.reasoning = parsed.reasoning;
      } else if (typeof parsed.reason === "string") {
        result.reasoning = parsed.reason;
      }
      if (Array.isArray(parsed.criteria)) {
        const criteria: Array<{ id: string; value: number }> = [];
        for (const item of parsed.criteria) {
          if (
            item &&
            typeof item === "object" &&
            typeof (item as { id?: unknown }).id === "string" &&
            typeof (item as { value?: unknown }).value === "number"
          ) {
            criteria.push({
              id: (item as { id: string }).id,
              value: (item as { value: number }).value,
            });
          }
        }
        if (criteria.length > 0) {
          result.criteria = criteria;
        }
      }
      if (typeof parsed.model === "string") {
        result.model = parsed.model;
      }
      return result;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function buildJudgePrompt(
  run: RunRecord,
  criteria: Array<{ id: string; description: string }>,
): string {
  const criteriaJson = JSON.stringify(criteria, null, 2);
  const transcript = [
    `Request: ${run.request ?? "(redacted)"}`,
    `Agent: ${run.agent.name} (${run.agent.id})`,
    `Outcome: ${run.outcome ?? "unknown"}`,
    `Actions: ${JSON.stringify(run.actions)}`,
  ].join("\n");
  return [
    "scenario: judge",
    "You are judging an agent run. Do not modify files or run commands.",
    "Score the run against these criteria:",
    criteriaJson,
    "Run transcript:",
    transcript,
    'Respond with JSON only: {"value": number, "reasoning": string, "criteria": [{"id": string, "value": number}]}',
  ].join("\n\n");
}

function rejectTerminalError(): SterError {
  return new SterError("blocked-by-policy", "Judging sessions cannot use terminals");
}

/**
 * On-demand judging in a separate hidden ACP session with reduced capabilities (R15).
 */
export async function judgeRun(options: JudgeRunOptions): Promise<RunScore> {
  if (!options.policy.agentAllowed(options.agentId)) {
    throw new SterError("blocked-by-policy", "Judging agent is blocked by organization policy", {
      agentId: options.agentId,
    });
  }
  const agent = options.agents.get(options.agentId);
  if (!agent?.launch) {
    throw new SterError("agent-not-ready", "Judging agent is not ready", {
      agentId: options.agentId,
    });
  }
  if (agent.readiness === "blocked-by-policy") {
    throw new SterError("blocked-by-policy", "Judging agent is blocked by organization policy", {
      agentId: options.agentId,
    });
  }
  if (!agent.confirmedAt) {
    throw new SterError("agent-not-confirmed", "Confirm the judging agent before use", {
      agentId: options.agentId,
    });
  }

  const applied = options.factory.resolveApplied(options.run.cwd);
  const criteria = applied?.judging?.criteria ?? [];
  if (criteria.length === 0) {
    throw new SterError(
      "definition-untrusted",
      "Trusted factory judging criteria are required to judge a run",
      { cwd: options.run.cwd },
    );
  }
  const scale = {
    min: applied?.judging?.scale?.min ?? 0,
    max: applied?.judging?.scale?.max ?? 10,
  };

  const prompt = buildJudgePrompt(
    options.run,
    criteria.map((item) => ({ id: item.id, description: item.description })),
  );

  let processHandle: AgentProcess | undefined;
  let connection: AcpConnection | undefined;
  const judgingRun = startRun({
    sessionId: options.run.sessionId,
    kind: "judging",
    request: prompt,
    agent: {
      id: agent.id,
      name: agent.name,
      ...(agent.version !== undefined ? { version: agent.version } : {}),
    },
    permissionMode: "always-ask",
    cwd: options.run.cwd,
    ...(options.run.factoryDefinitionHash !== undefined
      ? { factoryDefinitionHash: options.run.factoryDefinitionHash }
      : {}),
  });
  options.persistRun(judgingRun);

  try {
    processHandle = spawnAgentProcess({
      launch: agent.launch,
      environment: options.environment,
      log: options.log,
    });
    connection = await connectAgent({
      process: processHandle,
      log: options.log,
      clientInfo: { name: "ster-judge", version: "0.0.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: false },
        terminal: false,
      },
      handlers: {
        readTextFile: () => Promise.resolve({ content: "" }),
        writeTextFile: () =>
          Promise.reject(new SterError("blocked-by-policy", "Judging sessions cannot write files")),
        requestPermission: () =>
          Promise.resolve({
            outcome: { outcome: "cancelled" as const },
          }),
        createTerminal: () => Promise.reject(rejectTerminalError()),
        terminalOutput: () => Promise.reject(rejectTerminalError()),
        waitForTerminalExit: () => Promise.reject(rejectTerminalError()),
        killTerminal: () => Promise.reject(rejectTerminalError()),
        releaseTerminal: () => Promise.reject(rejectTerminalError()),
      },
    });

    const created = await connection.client.request(methods.agent.session.new, {
      cwd: options.run.cwd,
      mcpServers: [],
    });
    const agentSessionId = created.sessionId;

    let assistantText = "";
    const unsubscribe = connection.onSessionUpdate(agentSessionId, (notification) => {
      const update = notification.update as Record<string, unknown>;
      if (
        update.sessionUpdate === "agent_message_chunk" &&
        update.content &&
        typeof update.content === "object" &&
        (update.content as { type?: string }).type === "text" &&
        typeof (update.content as { text?: string }).text === "string"
      ) {
        assistantText += (update.content as { text: string }).text;
      }
    });

    await connection.client.request(methods.agent.session.prompt, {
      sessionId: agentSessionId,
      prompt: [{ type: "text", text: prompt }],
    });
    await connection.flushSessionUpdates(agentSessionId);
    unsubscribe();

    try {
      await connection.client.request(methods.agent.session.close, {
        sessionId: agentSessionId,
      });
    } catch {
      // ignore
    }

    const parsed = parseJudgeResponse(assistantText);
    if (!parsed) {
      throw new SterError("invalid-argument", "Judging agent did not return a usable JSON score", {
        preview: assistantText.slice(0, 200),
      });
    }

    const finishedJudging = finalizeRun(judgingRun, {
      outcome: "completed",
      stopReason: "end_turn",
    });
    options.persistRun(finishedJudging);

    const score = createAgentScore({
      runId: options.run.id,
      value: parsed.value,
      scale,
      ...(parsed.reasoning !== undefined ? { reasoning: parsed.reasoning } : {}),
      ...(parsed.criteria !== undefined ? { criteria: parsed.criteria } : {}),
      judge: {
        agentId: agent.id,
        ...(agent.version !== undefined ? { version: agent.version } : {}),
        ...(parsed.model !== undefined ? { model: parsed.model } : {}),
        judgingRunId: finishedJudging.id,
      },
    });
    options.persistScore(score);
    return score;
  } catch (error) {
    const failed = finalizeRun(judgingRun, {
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
      stopReason: "error",
    });
    options.persistRun(failed);
    throw error;
  } finally {
    connection?.close();
    await processHandle?.kill();
  }
}
