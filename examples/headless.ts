/**
 * Headless example (FR-061). Creates the core, confirms the mock agent, runs
 * `scenario: hello`, prints the run record, and exits.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_VERSION, createCore, MOCK_AGENT_ID, parseBrand } from "@ster/core";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mockAgentEntry = join(repoRoot, "packages/mock-agent/src/index.ts");
const dataDir = mkdtempSync(join(tmpdir(), "ster-headless-"));
const cwd = mkdtempSync(join(tmpdir(), "ster-headless-cwd-"));

const brand = parseBrand({
  productName: "Ster",
  appId: "app.ster.desktop",
  dataDirName: "Ster",
  policyDirName: "SterPolicy",
  icon: "icon.png",
  colors: { accent: "#111111" },
});

const environment: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === "string") {
    environment[key] = value;
  }
}

const core = await createCore({
  dataDir,
  brand,
  policySources: [],
  environment,
  includeMockAgent: true,
  mockAgentEntry,
});

await core.agents.confirmFirstStart(MOCK_AGENT_ID);
const session = await core.sessions.create({ agentId: MOCK_AGENT_ID, cwd });
const run = await core.sessions.prompt(session.id, [{ type: "text", text: "scenario: hello" }]);
const items = await core.sessions.items(session.id, { limit: 20 });
await core.dispose();

rmSync(dataDir, { recursive: true, force: true });
rmSync(cwd, { recursive: true, force: true });

console.log(
  JSON.stringify({
    ok: true,
    coreVersion: CORE_VERSION,
    productName: brand.productName,
    sessionId: session.id,
    run: {
      id: run.id,
      outcome: run.outcome,
      stopReason: run.stopReason,
    },
    itemKinds: items.map((item) => item.kind),
  }),
);
