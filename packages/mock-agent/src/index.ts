#!/usr/bin/env node
import { ndJsonStream } from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import { createMockAgent, mockAgentRequireAuthFromEnv } from "./agent.js";
import { SCENARIO_NAMES } from "./scenarios.js";

/**
 * Stdio ACP mock agent. Select a scenario with prompt text like `scenario: hello`.
 * Supported scenarios: see SCENARIO_NAMES.
 *
 * Env:
 * - STER_MOCK_AUTH_REQUIRED=1 — session/new requires authenticate first
 * - STER_MOCK_PROTOCOL_VERSION=N — advertise a specific protocol version
 */
const options = mockAgentRequireAuthFromEnv();
if (options.protocolVersion !== undefined && Number.isNaN(options.protocolVersion)) {
  process.stderr.write("ster-mock-agent: invalid STER_MOCK_PROTOCOL_VERSION\n");
  process.exit(1);
}

const output = Writable.toWeb(process.stdout);
const input = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
const stream = ndJsonStream(output, input);

createMockAgent(options).connect(stream);

process.stderr.write(
  `ster-mock-agent: listening on stdio (scenarios: ${SCENARIO_NAMES.join(", ")})\n`,
);

export { createMockAgent, mockAgentRequireAuthFromEnv, SCENARIO_NAMES };
export type { MockAgentOptions } from "./agent.js";
export type { ScenarioName, SessionState } from "./scenarios.js";
