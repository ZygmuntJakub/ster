import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { PolicyItemDefinition } from "../../src/extensions/index.js";
import { applyPolicyExtensions, createRestrictiveHooks } from "../../src/policy/extensions.js";
import { createPolicyService, memoryPolicySource } from "../../src/index.js";

describe("policy extensions", () => {
  it("rejects an extension that would loosen registry mode", () => {
    const state = {
      blockedAgents: new Set<string>(),
      blockedModes: new Set<string>(),
      customAllowed: true,
      requireChecksum: false,
      allowInstallScripts: true,
      registryMode: "disabled" as const,
    };
    const hooks = createRestrictiveHooks(state);
    expect(() => {
      hooks.setRegistry("public");
    }).toThrow(/loosen/);
  });

  it("applies x- keys and fails closed on unknown keys", () => {
    const blockExtra: PolicyItemDefinition<{ agentId: string }> = {
      key: "x-block-agent",
      schema: z.object({ agentId: z.string() }),
      enforce(value, hooks) {
        hooks.blockAgent(value.agentId);
      },
    };
    const ok = applyPolicyExtensions(
      { version: 1, "x-block-agent": { agentId: "evil" } },
      new Map([["x-block-agent", blockExtra]]),
    );
    expect(ok.ok).toBe(true);
    expect(ok.restrictions.blockedAgents.has("evil")).toBe(true);

    const unknown = applyPolicyExtensions(
      { version: 1, "x-unknown": true },
      new Map([["x-block-agent", blockExtra]]),
    );
    expect(unknown.ok).toBe(false);

    const invalidSchema = applyPolicyExtensions(
      { version: 1, "x-block-agent": { agentId: 9 } },
      new Map([["x-block-agent", blockExtra]]),
    );
    expect(invalidSchema.ok).toBe(false);
    expect(invalidSchema.problems.some((p) => p.code === "extension")).toBe(true);
  });

  it("enforces non-x definitions and registry custom-url restrictions", () => {
    const state = {
      blockedAgents: new Set<string>(),
      blockedModes: new Set<string>(),
      customAllowed: true,
      requireChecksum: false,
      allowInstallScripts: true,
      registryMode: "custom" as const,
      registryUrl: "https://registry.example/custom",
    };
    const hooks = createRestrictiveHooks(state);
    expect(() => {
      hooks.setRegistry("custom");
    }).toThrow(/url/u);
    expect(() => {
      hooks.setRegistry("custom", "https://other.example");
    }).toThrow(/cannot change/u);
    hooks.setRegistry("custom", "https://registry.example/custom");
    hooks.setRegistry("disabled");
    expect(state.registryMode).toBe("disabled");
    expect(state.registryUrl).toBeUndefined();
    hooks.blockMode("plan");
    hooks.requireChecksum();
    hooks.disallowCustomAgents();
    expect(state.blockedModes.has("plan")).toBe(true);
    expect(state.requireChecksum).toBe(true);
    expect(state.customAllowed).toBe(false);

    const modeItem: PolicyItemDefinition<{ mode: string }> = {
      key: "defaultMode",
      schema: z.object({ mode: z.string() }),
      enforce(value, next) {
        next.blockMode(value.mode);
      },
    };
    const applied = applyPolicyExtensions(
      { version: 1, defaultMode: { mode: "ask" } },
      new Map([["defaultMode", modeItem]]),
    );
    expect(applied.ok).toBe(true);
    expect(applied.restrictions.blockedModes.has("ask")).toBe(true);

    const loosenBuiltin: PolicyItemDefinition<{ mode: "public" }> = {
      key: "registry",
      schema: z.object({ mode: z.literal("public") }),
      enforce(value, next) {
        next.setRegistry(value.mode);
      },
    };
    const loosened = applyPolicyExtensions(
      { version: 1, registry: { mode: "public" } },
      new Map([["registry", loosenBuiltin]]),
    );
    // Starting from seeded public is fine; forcing loosen from disabled is covered elsewhere.
    expect(loosened.ok).toBe(true);
  });

  it("marks policy invalid when an extension tries to loosen", async () => {
    const loosen: PolicyItemDefinition<{ mode: "public" }> = {
      key: "x-registry",
      schema: z.object({ mode: z.literal("public") }),
      enforce(value, hooks) {
        hooks.setRegistry(value.mode);
      },
    };
    const policy = createPolicyService({
      sources: [
        memoryPolicySource(
          "machine",
          {
            version: 1,
            registry: { mode: "disabled" },
            "x-registry": { mode: "public" },
          },
          "machine",
        ),
      ],
      policyItems: [loosen],
    });
    await policy.reload();
    expect(policy.state).toBe("invalid");
    expect(policy.problems().some((p) => p.code === "extension-loosen")).toBe(true);
  });
});
