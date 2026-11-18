import {
  PROTOCOL_VERSION,
  RequestError,
  agent,
  methods,
  type AgentApp,
} from "@agentclientprotocol/sdk";
import { randomUUID } from "node:crypto";
import { promptText, runScenario, selectScenario, type SessionState } from "./scenarios.js";

export interface MockAgentOptions {
  /** Override advertised protocol version (for unsupported-version tests). */
  protocolVersion?: number;
  /** When true, session/new requires authenticate first. */
  requireAuth?: boolean;
}

/**
 * Build the scriptable mock ACP agent used by tests and development.
 */
export function createMockAgent(options: MockAgentOptions = {}): AgentApp {
  const sessions = new Map<string, SessionState>();
  let authenticated = options.requireAuth !== true;
  const protocolVersion = options.protocolVersion ?? PROTOCOL_VERSION;

  return agent({ name: "ster-mock-agent" })
    .onRequest(methods.agent.initialize, ({ params }) => {
      if (params.protocolVersion < 1) {
        throw RequestError.unsupportedProtocolVersion(params.protocolVersion, [PROTOCOL_VERSION]);
      }
      const terminalAuth = params.clientCapabilities?.auth?.terminal === true;
      return {
        protocolVersion,
        agentCapabilities: {
          loadSession: false,
          promptCapabilities: {
            image: false,
            audio: false,
            embeddedContext: true,
          },
        },
        agentInfo: {
          name: "ster-mock-agent",
          version: "0.0.0",
        },
        authMethods: [
          {
            id: "mock-agent-login",
            name: "Mock browser login",
            description: "Simulated agent-handled login",
          },
          ...(terminalAuth
            ? [
                {
                  id: "mock-terminal-login",
                  name: "Mock terminal login",
                  description: "Simulated terminal login",
                  type: "terminal" as const,
                  args: ["--mock-login"],
                },
              ]
            : []),
        ],
      };
    })
    .onRequest(methods.agent.authenticate, ({ params }) => {
      if (params.methodId !== "mock-agent-login") {
        throw RequestError.invalidParams({ methodId: params.methodId }, "Unknown auth method");
      }
      authenticated = true;
      return {};
    })
    .onRequest(methods.agent.session.new, ({ params }) => {
      if (!authenticated) {
        throw RequestError.authRequired({ reason: "mock agent requires login" });
      }
      const id = randomUUID();
      sessions.set(id, {
        id,
        cwd: params.cwd,
        cancelled: false,
        authenticated,
      });
      return {
        sessionId: id,
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "mock-small",
            options: [
              { value: "mock-small", name: "Mock Small" },
              { value: "mock-large", name: "Mock Large" },
            ],
          },
        ],
      };
    })
    .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
      const session = sessions.get(params.sessionId);
      if (!session) {
        throw RequestError.sessionNotFound(params.sessionId);
      }
      session.cancelled = false;
      const scenario = selectScenario(promptText(params));
      return runScenario(client, session, scenario);
    })
    .onNotification(methods.agent.session.cancel, ({ params }) => {
      const session = sessions.get(params.sessionId);
      if (session) {
        session.cancelled = true;
      }
    })
    .onRequest(methods.agent.session.close, ({ params }) => {
      sessions.delete(params.sessionId);
      return {};
    })
    .onRequest(methods.agent.session.setConfigOption, () => {
      return {
        configOptions: [
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "mock-small",
            options: [
              { value: "mock-small", name: "Mock Small" },
              { value: "mock-large", name: "Mock Large" },
            ],
          },
        ],
      };
    });
}

export function mockAgentRequireAuthFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MockAgentOptions {
  const options: MockAgentOptions = {
    requireAuth: env["STER_MOCK_AUTH_REQUIRED"] === "1",
  };
  if (env["STER_MOCK_PROTOCOL_VERSION"]) {
    options.protocolVersion = Number(env["STER_MOCK_PROTOCOL_VERSION"]);
  }
  return options;
}
