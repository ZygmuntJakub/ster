import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { connectAgent } from "../../src/acp/connection.js";
import { spawnAgentProcess, type AgentProcess } from "../../src/acp/process.js";
import { SterError } from "../../src/errors.js";
import { createLogger } from "../../src/log.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const mockAgentEntry = join(repoRoot, "packages/mock-agent/src/index.ts");

const processes: AgentProcess[] = [];

afterEach(async () => {
  while (processes.length > 0) {
    const proc = processes.pop();
    if (proc) {
      await proc.kill();
    }
  }
});

function log() {
  return createLogger({ sink: () => undefined });
}

function spawnMock(env: Record<string, string> = {}): AgentProcess {
  const proc = spawnAgentProcess({
    launch: {
      command: process.execPath,
      args: ["--import", "tsx", mockAgentEntry],
      env: {
        ...env,
        // Avoid inheriting experimental warning noise as failures.
        NODE_NO_WARNINGS: "1",
      },
    },
    environment: {
      PATH: process.env["PATH"] ?? "/usr/bin",
      HOME: process.env["HOME"] ?? "/tmp",
    },
    log: log(),
  });
  processes.push(proc);
  return proc;
}

describe("ACP connection against mock agent", () => {
  it("handshakes and returns a capability snapshot", async () => {
    const proc = spawnMock();
    const connection = await connectAgent({
      process: proc,
      log: log(),
      clientInfo: { name: "ster-test", version: "0.0.0" },
    });
    try {
      expect(connection.capabilities.protocolVersion).toBe(1);
      expect(connection.capabilities.agentInfo?.name).toBe("ster-mock-agent");
      expect(connection.capabilities.authMethods.some((m) => m.id === "mock-agent-login")).toBe(
        true,
      );

      const session = await connection.client.buildSession("/tmp/ster-connection").start();
      const stop = await session.prompt("scenario: hello");
      expect(stop.stopReason).toBe("end_turn");
      session.dispose();
    } finally {
      connection.close();
      await proc.kill();
    }
  });

  it("delivers session updates in order under concurrent emission", async () => {
    const proc = spawnMock();
    const connection = await connectAgent({ process: proc, log: log() });
    try {
      const session = await connection.client.buildSession("/tmp/ster-connection").start();
      const texts: string[] = [];
      const done = new Promise<void>((resolve) => {
        connection.onSessionUpdate(session.sessionId, (notification) => {
          const update = notification.update;
          if (
            update.sessionUpdate === "agent_message_chunk" &&
            update.content.type === "text" &&
            update.content.text.startsWith("chunk-")
          ) {
            texts.push(update.content.text.trim());
            if (texts.length >= 40) {
              resolve();
            }
          }
        });
      });

      const promptPromise = session.prompt("scenario: long");
      await done;
      const stop = await promptPromise;
      expect(stop.stopReason).toBe("end_turn");
      expect(texts).toEqual(Array.from({ length: 40 }, (_, i) => `chunk-${String(i)}`));
      session.dispose();
    } finally {
      connection.close();
      await proc.kill();
    }
  });

  it("rejects unsupported protocol versions", async () => {
    const proc = spawnMock({ STER_MOCK_PROTOCOL_VERSION: "99" });
    await expect(
      connectAgent({
        process: proc,
        log: log(),
        supportedProtocolVersions: [1],
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(SterError);
      expect((error as SterError).code).toBe("protocol-unsupported");
      return true;
    });
  });

  it("surfaces agent exit when the process crashes", async () => {
    const proc = spawnMock();
    const connection = await connectAgent({ process: proc, log: log() });
    try {
      const session = await connection.client.buildSession("/tmp/ster-connection").start();
      await expect(session.prompt("scenario: crash")).rejects.toBeTruthy();
      const exit = await proc.exit;
      expect(exit.code === 2 || exit.signal !== null).toBe(true);
      session.dispose();
    } finally {
      connection.close();
      await proc.kill();
    }
  });
});
