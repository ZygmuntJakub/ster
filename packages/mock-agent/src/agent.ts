import {
  PROTOCOL_VERSION,
  RequestError,
  agent,
  methods,
  type AgentApp,
  type SessionConfigOption,
} from "@agentclientprotocol/sdk";
import { randomUUID } from "node:crypto";
import { promptText, runScenario, selectScenario, type SessionState } from "./scenarios.js";

export interface MockAgentOptions {
  /** Override advertised protocol version (for unsupported-version tests). */
  protocolVersion?: number;
  /** When true, session/new requires authenticate first. */
  requireAuth?: boolean;
  /** When false, omit session resume capability (default true). */
  supportResume?: boolean;
  /**
   * When true, `session/new` returns legacy `modes` only (no `configOptions`)
   * so clients exercise `session/set_mode` fallback (research.md R2).
   */
  legacyModesOnly?: boolean;
}

function defaultModelOption(currentValue = "mock-small"): SessionConfigOption {
  return {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue,
    options: [
      { value: "mock-small", name: "Mock Small" },
      { value: "mock-large", name: "Mock Large" },
    ],
  };
}

function defaultModeOption(currentValue = "code"): SessionConfigOption {
  return {
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select",
    currentValue,
    options: [
      { value: "code", name: "Code" },
      { value: "ask", name: "Ask" },
    ],
  };
}

const LEGACY_MODES = {
  currentModeId: "code",
  availableModes: [
    { id: "code", name: "Code" },
    { id: "ask", name: "Ask" },
  ],
};

/**
 * Build the scriptable mock ACP agent used by tests and development.
 */
export function createMockAgent(options: MockAgentOptions = {}): AgentApp {
  const sessions = new Map<string, SessionState>();
  const configBySession = new Map<string, SessionConfigOption[]>();
  const modeBySession = new Map<string, string>();
  let authenticated = options.requireAuth !== true;
  const protocolVersion = options.protocolVersion ?? PROTOCOL_VERSION;
  const legacyModesOnly =
    options.legacyModesOnly === true || process.env["STER_MOCK_LEGACY_MODES"] === "1";

  return agent({ name: "ster-mock-agent" })
    .onRequest(methods.agent.initialize, ({ params }) => {
      if (params.protocolVersion < 1) {
        throw RequestError.unsupportedProtocolVersion(params.protocolVersion, [PROTOCOL_VERSION]);
      }
      const terminalAuth = params.clientCapabilities?.auth?.terminal === true;
      const supportResume = options.supportResume !== false;
      return {
        protocolVersion,
        agentCapabilities: {
          loadSession: false,
          promptCapabilities: {
            image: false,
            audio: false,
            embeddedContext: true,
          },
          ...(supportResume ? { sessionCapabilities: { resume: {} } } : {}),
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
      modeBySession.set(id, LEGACY_MODES.currentModeId);
      if (legacyModesOnly) {
        return {
          sessionId: id,
          modes: { ...LEGACY_MODES },
        };
      }
      const configOptions = [defaultModeOption(), defaultModelOption()];
      configBySession.set(id, configOptions);
      return { sessionId: id, configOptions };
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
      configBySession.delete(params.sessionId);
      modeBySession.delete(params.sessionId);
      return {};
    })
    .onRequest(methods.agent.session.resume, ({ params }) => {
      if (options.supportResume === false) {
        throw RequestError.invalidParams({}, "Resume is not supported");
      }
      if (!authenticated) {
        throw RequestError.authRequired({ reason: "mock agent requires login" });
      }
      sessions.set(params.sessionId, {
        id: params.sessionId,
        cwd: params.cwd,
        cancelled: false,
        authenticated,
      });
      return {};
    })
    .onRequest(methods.agent.session.setConfigOption, ({ params }) => {
      const current = configBySession.get(params.sessionId) ?? [
        defaultModeOption(),
        defaultModelOption(),
      ];
      const next = current.map((option) => {
        if (option.id !== params.configId) {
          return option;
        }
        if (option.type === "boolean" && typeof params.value === "boolean") {
          return { ...option, currentValue: params.value };
        }
        if (option.type === "select" && typeof params.value === "string") {
          return { ...option, currentValue: params.value };
        }
        return option;
      });
      configBySession.set(params.sessionId, next);
      return { configOptions: next };
    })
    .onRequest(methods.agent.session.setMode, ({ params }) => {
      modeBySession.set(params.sessionId, params.modeId);
      const current = configBySession.get(params.sessionId);
      if (current) {
        configBySession.set(
          params.sessionId,
          current.map((option) =>
            option.id === "mode" && option.type === "select"
              ? { ...option, currentValue: params.modeId }
              : option,
          ),
        );
      }
      return {};
    });
}

export function mockAgentRequireAuthFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MockAgentOptions {
  const options: MockAgentOptions = {
    requireAuth: env["STER_MOCK_AUTH_REQUIRED"] === "1",
    supportResume: env["STER_MOCK_NO_RESUME"] !== "1",
    legacyModesOnly: env["STER_MOCK_LEGACY_MODES"] === "1",
  };
  if (env["STER_MOCK_PROTOCOL_VERSION"]) {
    options.protocolVersion = Number(env["STER_MOCK_PROTOCOL_VERSION"]);
  }
  return options;
}
