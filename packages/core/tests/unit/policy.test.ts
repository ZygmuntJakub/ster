import { describe, expect, it } from "vitest";
import { mergePolicyDocuments } from "../../src/policy/merge.js";
import { createPolicyService, memoryPolicySource } from "../../src/index.js";
import { validatePolicyDocument } from "../../src/policy/validate.js";
import { machinePolicyPath } from "../../src/policy/sources.js";

describe("policy validation", () => {
  it("accepts a minimal valid document", () => {
    const result = validatePolicyDocument({ version: 1 }, "test");
    expect(result.ok).toBe(true);
    expect(result.document).toEqual({ version: 1 });
  });

  it("rejects wrong version and unknown keys", () => {
    const result = validatePolicyDocument({ version: 2, foo: true }, "test");
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.path === "version")).toBe(true);
    expect(result.problems.some((p) => p.path === "foo")).toBe(true);
  });

  it("requires https url for custom registry", () => {
    const missing = validatePolicyDocument({ version: 1, registry: { mode: "custom" } }, "test");
    expect(missing.ok).toBe(false);

    const http = validatePolicyDocument(
      { version: 1, registry: { mode: "custom", url: "http://example.com/r.json" } },
      "test",
    );
    expect(http.ok).toBe(false);

    const ok = validatePolicyDocument(
      {
        version: 1,
        registry: { mode: "custom", url: "https://example.com/r.json" },
      },
      "test",
    );
    expect(ok.ok).toBe(true);
  });

  it("requires default to be in modes", () => {
    const result = validatePolicyDocument(
      {
        version: 1,
        permissions: { modes: ["always-ask"], default: "ask-with-rules" },
      },
      "test",
    );
    expect(result.ok).toBe(false);
  });
});

describe("policy merge", () => {
  it("lets machine win per top-level item", () => {
    const merged = mergePolicyDocuments([
      {
        sourceId: "builtin",
        document: {
          version: 1,
          agents: { allow: ["a"], customAllowed: true },
          install: { requireChecksum: false },
        },
      },
      {
        sourceId: "machine",
        document: {
          version: 1,
          agents: { allow: ["b"], customAllowed: false },
        },
      },
    ]);
    expect(merged.agents).toEqual({ allow: ["b"], customAllowed: false });
    expect(merged.install).toEqual({ requireChecksum: false });
  });
});

describe("PolicyService", () => {
  it("starts absent with no sources", async () => {
    const policy = createPolicyService();
    await policy.reload();
    expect(policy.state).toBe("absent");
    expect(policy.effective().items).toEqual([]);
  });

  it("merges builtin and machine with managed markers", async () => {
    const policy = createPolicyService({
      sources: [
        memoryPolicySource("builtin", { version: 1, agents: { allow: ["mock-agent"] } }, "builtin"),
        memoryPolicySource(
          "machine",
          {
            version: 1,
            agents: { allow: ["mock-agent"], customAllowed: false },
            permissions: { default: "always-ask", modes: ["always-ask"] },
          },
          "machine",
        ),
      ],
    });
    await policy.reload();
    expect(policy.state).toBe("valid");
    expect(policy.customAgentsAllowed()).toBe(false);
    expect(policy.agentAllowed("mock-agent")).toBe(true);
    expect(policy.agentAllowed("other")).toBe(false);
    const allowItem = policy.effective().items.find((i) => i.key === "agents.allow");
    expect(allowItem?.managed).toBe(true);
    expect(policy.managedSettingKeys()).toContain("defaultPermissionMode");
  });

  it("becomes invalid on schema failure", async () => {
    const policy = createPolicyService({
      sources: [memoryPolicySource("machine", { version: 9 }, "machine")],
    });
    await policy.reload();
    expect(policy.state).toBe("invalid");
    expect(policy.problems().length).toBeGreaterThan(0);
    expect(policy.document()).toBeNull();
  });

  it("resolves machine policy paths per platform", () => {
    expect(machinePolicyPath("Ster", "darwin")).toBe(
      "/Library/Application Support/Ster/policy.json",
    );
    expect(machinePolicyPath("Ster", "linux")).toBe("/etc/Ster/policy.json");
    expect(machinePolicyPath("Ster", "win32")).toMatch(/[\\/]Ster[\\/]policy\.json$/u);
  });
});
