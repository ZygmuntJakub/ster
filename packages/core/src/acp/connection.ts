import {
  PROTOCOL_VERSION,
  client,
  methods,
  ndJsonStream,
  type AgentCapabilities,
  type AuthMethod,
  type ClientConnection,
  type Implementation,
  type InitializeResponse,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import { SterError } from "../errors.js";
import type { Logger } from "../log.js";
import type { AgentProcess } from "./process.js";

export interface CapabilitySnapshot {
  protocolVersion: number;
  agentCapabilities: AgentCapabilities;
  authMethods: AuthMethod[];
  agentInfo: Implementation | null;
}

export type SessionUpdateHandler = (notification: SessionNotification) => void | Promise<void>;

export interface AcpConnection {
  readonly capabilities: CapabilitySnapshot;
  readonly client: ClientConnection["agent"];
  readonly closed: Promise<void>;
  /**
   * Register a per-session handler. Updates for that session are delivered in
   * arrival order through a serial queue (R1).
   */
  onSessionUpdate(sessionId: string, handler: SessionUpdateHandler): () => void;
  /** Wait until queued update handlers for the session have settled. */
  flushSessionUpdates(sessionId: string): Promise<void>;
  close(): void;
}

export interface ConnectAgentOptions {
  process: AgentProcess;
  log: Logger;
  clientInfo?: Implementation;
  /** Supported protocol versions; defaults to the SDK stable version. */
  supportedProtocolVersions?: readonly number[];
}

/**
 * Serial queue: each session's update handlers run one-at-a-time in order.
 */
class SessionUpdateQueue {
  private readonly chains = new Map<string, Promise<void>>();

  enqueue(sessionId: string, work: () => void | Promise<void>): void {
    const previous = this.chains.get(sessionId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await work();
      });
    this.chains.set(sessionId, next);
    void next.finally(() => {
      if (this.chains.get(sessionId) === next) {
        this.chains.delete(sessionId);
      }
    });
  }

  idle(sessionId: string): Promise<void> {
    return this.chains.get(sessionId) ?? Promise.resolve();
  }
}

function toCapabilitySnapshot(response: InitializeResponse): CapabilitySnapshot {
  return {
    protocolVersion: response.protocolVersion,
    agentCapabilities: response.agentCapabilities ?? {},
    authMethods: response.authMethods ?? [],
    agentInfo: response.agentInfo ?? null,
  };
}

/**
 * Open an ACP client connection over an agent process's stdio (R1).
 */
export async function connectAgent(options: ConnectAgentOptions): Promise<AcpConnection> {
  const supported = options.supportedProtocolVersions ?? [PROTOCOL_VERSION];
  const stream = ndJsonStream(
    Writable.toWeb(options.process.stdin),
    Readable.toWeb(options.process.stdout) as ReadableStream<Uint8Array>,
  );

  const handlers = new Map<string, Set<SessionUpdateHandler>>();
  const queue = new SessionUpdateQueue();

  const app = client({ name: options.clientInfo?.name ?? "ster" }).onNotification(
    methods.client.session.update,
    ({ params }) => {
      const sessionHandlers = handlers.get(params.sessionId);
      if (!sessionHandlers || sessionHandlers.size === 0) {
        return;
      }
      for (const handler of sessionHandlers) {
        queue.enqueue(params.sessionId, () => handler(params));
      }
    },
  );

  const connection = app.connect(stream);

  void options.process.exit.then((result) => {
    options.log.warn("agent process exited", {
      code: result.code,
      signal: result.signal,
    });
    connection.close(
      new SterError("agent-exited", "Agent process exited", {
        code: result.code,
        signal: result.signal,
      }),
    );
  });

  let initialize: InitializeResponse;
  try {
    initialize = await connection.agent.request(methods.agent.initialize, {
      protocolVersion: Math.max(...supported),
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
        auth: { terminal: true },
      },
      clientInfo: options.clientInfo ?? { name: "ster", version: "0.0.0" },
    });
  } catch (cause) {
    connection.close();
    await options.process.kill();
    throw new SterError("agent-exited", "Agent initialize failed", {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }

  if (!supported.includes(initialize.protocolVersion)) {
    connection.close();
    await options.process.kill();
    throw new SterError(
      "protocol-unsupported",
      `Agent protocol version ${String(initialize.protocolVersion)} is unsupported`,
      {
        protocolVersion: initialize.protocolVersion,
        supported: [...supported],
      },
    );
  }

  const capabilities = toCapabilitySnapshot(initialize);

  return {
    capabilities,
    client: connection.agent,
    closed: connection.closed,
    onSessionUpdate(sessionId, handler) {
      const set = handlers.get(sessionId) ?? new Set();
      set.add(handler);
      handlers.set(sessionId, set);
      return () => {
        set.delete(handler);
        if (set.size === 0) {
          handlers.delete(sessionId);
        }
      };
    },
    flushSessionUpdates(sessionId) {
      return queue.idle(sessionId);
    },
    close() {
      connection.close();
    },
  };
}
