import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import { createAgentService } from "../../src/agents/service.js";
import { createLogger } from "../../src/log.js";
import { createSettingsService } from "../../src/settings/service.js";
import { openSqliteStore } from "../../src/store/sqlite.js";
import { isSterError } from "../../src/errors.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const mockAgentEntry = join(repoRoot, "packages/mock-agent/src/index.ts");

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("AgentService", () => {
  it("lists the mock agent, confirms first start, and saves customs", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-agents-"));
    tempDirs.push(dataDir);
    const store = openSqliteStore({ dataDir });
    const settings = createSettingsService({ store });
    const agents = createAgentService({
      store,
      settings,
      log: createLogger({ sink: () => undefined }),
      environment: { PATH: process.env["PATH"] ?? "/usr/bin", HOME: dataDir },
      includeMockAgent: true,
      mockAgentEntry,
    });

    const listed = await agents.list();
    expect(listed.some((a) => a.id === MOCK_AGENT_ID)).toBe(true);
    expect(agents.get(MOCK_AGENT_ID)?.confirmedAt).toBeUndefined();

    await agents.confirmFirstStart(MOCK_AGENT_ID);
    expect(agents.get(MOCK_AGENT_ID)?.confirmedAt).toBeTruthy();

    const custom = await agents.saveCustom({
      name: "Local",
      command: "/bin/echo",
      args: ["hi"],
      env: {},
    });
    expect(custom.id.startsWith("custom:")).toBe(true);
    await agents.deleteCustom(custom.id);
    expect(agents.get(custom.id)).toBeNull();

    await expect(agents.confirmFirstStart("missing")).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "not-found",
    );

    store.close();
  });

  it("omits the mock agent when includeMockAgent is false", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-agents-off-"));
    tempDirs.push(dataDir);
    const store = openSqliteStore({ dataDir });
    const settings = createSettingsService({ store });
    const agents = createAgentService({
      store,
      settings,
      log: createLogger({ sink: () => undefined }),
      environment: { PATH: "/usr/bin", HOME: dataDir },
      includeMockAgent: false,
    });
    expect(await agents.list()).toEqual([]);
    store.close();
  });
});
