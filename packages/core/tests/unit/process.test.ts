import { describe, expect, it } from "vitest";
import { filterAgentEnvironment } from "../../src/acp/process.js";

describe("filterAgentEnvironment", () => {
  it("strips NODE_OPTIONS and ELECTRON_* then applies launch env", () => {
    const filtered = filterAgentEnvironment(
      {
        PATH: "/usr/bin",
        NODE_OPTIONS: "--inspect",
        ELECTRON_RUN_AS_NODE: "1",
        ELECTRON_NO_ASAR: "1",
        HOME: "/home/me",
      },
      { AGENT_TOKEN: "x", PATH: "/custom/bin" },
    );
    expect(filtered).toEqual({
      PATH: "/custom/bin",
      HOME: "/home/me",
      AGENT_TOKEN: "x",
    });
  });
});
