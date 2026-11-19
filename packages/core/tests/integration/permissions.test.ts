import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_AGENT_ID } from "../../src/agents/agent.js";
import {
  createCore,
  STER_REMEMBER_OPTION_ID,
  type Core,
  type CoreEvent,
  parseBrand,
} from "../../src/index.js";
import { createLogger } from "../../src/log.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const mockAgentEntry = join(repoRoot, "packages/mock-agent/src/index.ts");

const brand = parseBrand({
  productName: "Ster",
  appId: "com.example.ster",
  dataDirName: "Ster",
  policyDirName: "SterPolicy",
  icon: "icon.png",
  colors: { accent: "#000000" },
});

const tempDirs: string[] = [];
const cores: Core[] = [];

afterEach(async () => {
  while (cores.length > 0) {
    const core = cores.pop();
    if (core) {
      await core.dispose();
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function boot(defaultPermissionMode = "always-ask"): Promise<{ core: Core; cwd: string }> {
  const dataDir = mkdtempSync(join(tmpdir(), "ster-perm-data-"));
  const cwd = mkdtempSync(join(tmpdir(), "ster-perm-cwd-"));
  tempDirs.push(dataDir, cwd);
  const core = await createCore({
    dataDir,
    brand,
    policySources: [],
    environment: {
      PATH: process.env["PATH"] ?? "/usr/bin",
      HOME: process.env["HOME"] ?? dataDir,
    },
    includeMockAgent: true,
    mockAgentEntry,
    nodeExecutable: process.execPath,
    log: createLogger({ fields: { test: "permissions" } }),
  });
  cores.push(core);
  await core.agents.confirmFirstStart(MOCK_AGENT_ID);
  if (defaultPermissionMode !== "always-ask") {
    core.settings.set({ defaultPermissionMode });
  }
  return { core, cwd };
}

function itemTexts(items: Awaited<ReturnType<Core["sessions"]["items"]>>): string[] {
  return items
    .filter((item) => item.kind === "agent-message" || item.kind === "notice")
    .map((item) => JSON.stringify(item.payload));
}

describe("permissions integration", () => {
  it("remembers an edit rule and auto-approves the next edit with a notice", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({
      agentId: MOCK_AGENT_ID,
      cwd,
      permissionMode: "ask-with-rules",
    });

    let first = true;
    const unsubscribe = core.events.subscribe((event: CoreEvent) => {
      if (event.type !== "approval.requested" || event.sessionId !== session.id) {
        return;
      }
      if (first) {
        first = false;
        void core.sessions.resolveApproval(event.approval.id, {
          optionId: STER_REMEMBER_OPTION_ID,
        });
        return;
      }
      void core.sessions.resolveApproval(event.approval.id, { optionId: "allow" });
    });

    await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: edit-file" }]);
    const rules = await core.sessions.rules(session.id);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.match.kind).toBe("edit");

    await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: edit-file" }]);
    unsubscribe();

    const items = await core.sessions.items(session.id, { limit: 100 });
    expect(itemTexts(items).some((text) => /approval-by-rule|rule-created/.test(text))).toBe(true);

    const created = rules[0];
    expect(created).toBeTruthy();
    if (!created) {
      throw new Error("expected a remembered rule");
    }
    await core.sessions.revokeRule(created.id);
    expect(await core.sessions.rules(session.id)).toHaveLength(0);
  });

  it("auto-approves reads then prompts for edits in auto-approve-reads", async () => {
    const { core, cwd } = await boot("auto-approve-reads");
    writeFileSync(join(cwd, "readme.md"), "# hi\n", "utf8");
    const session = await core.sessions.create({
      agentId: MOCK_AGENT_ID,
      cwd,
      permissionMode: "auto-approve-reads",
    });

    const prompted: string[] = [];
    const unsubscribe = core.events.subscribe((event: CoreEvent) => {
      if (event.type !== "approval.requested" || event.sessionId !== session.id) {
        return;
      }
      const subject = event.approval.subject as { kind?: string };
      prompted.push(subject.kind ?? "unknown");
      void core.sessions.resolveApproval(event.approval.id, { optionId: "allow" });
    });

    await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: read-then-edit" }]);
    unsubscribe();

    expect(prompted).toEqual(["edit"]);
    const items = await core.sessions.items(session.id, { limit: 100 });
    expect(itemTexts(items).some((text) => /approval-by-mode/.test(text))).toBe(true);
    expect(readFileSync(join(cwd, "notes.txt"), "utf8")).toContain("edited by mock agent");
  });

  it("prompts the outside-workspace guard and rejects the write when denied", async () => {
    const { core, cwd } = await boot();
    const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });

    const unsubscribe = core.events.subscribe((event: CoreEvent) => {
      if (event.type !== "approval.requested" || event.sessionId !== session.id) {
        return;
      }
      if (event.approval.source === "client-guard") {
        void core.sessions.resolveApproval(event.approval.id, { optionId: "reject" });
        return;
      }
      void core.sessions.resolveApproval(event.approval.id, { optionId: "allow" });
    });

    const run = await core.sessions.prompt(session.id, [
      { type: "text", text: "scenario: escape-workspace" },
    ]);
    unsubscribe();
    expect(run.outcome).toBe("completed");

    const items = await core.sessions.items(session.id, { limit: 50 });
    const texts = itemTexts(items);
    expect(texts.some((text) => /outside-workspace|Write failed|outside/i.test(text))).toBe(true);

    const guard = items.find(
      (item) =>
        item.kind === "approval" &&
        typeof item.payload === "object" &&
        item.payload !== null &&
        "source" in item.payload &&
        item.payload.source === "client-guard",
    );
    expect(guard).toBeTruthy();
  });
});
