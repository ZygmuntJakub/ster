import { describe, expect, it } from "vitest";
import { listExtensionAgents } from "../../src/agents/sources.js";
import type { AgentSource } from "../../src/extensions/index.js";

describe("agent sources", () => {
  it("merges candidates from a fake AgentSource", async () => {
    const source: AgentSource = {
      id: "fake",
      list: () =>
        Promise.resolve([
          {
            id: "ext:one",
            name: "Extension One",
            origin: "fake",
            launch: { command: "/bin/true", args: [], env: {} },
          },
        ]),
    };
    const agents = await listExtensionAgents([source], {
      env: { PATH: "/usr/bin" },
      dataDir: "/tmp",
    });
    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe("ext:one");
    expect(agents[0]?.readiness).toBe("ready");
  });
});
