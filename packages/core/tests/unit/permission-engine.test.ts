import { describe, expect, it } from "vitest";
import {
  decidePermission,
  STER_REMEMBER_OPTION_ID,
  withRememberOption,
} from "../../src/permissions/engine.js";
import { BUILTIN_PERMISSION_MODES } from "../../src/permissions/modes.js";
import type { PermissionRule } from "../../src/permissions/rules.js";
import type { PermissionModeDefinition } from "../../src/extensions/index.js";

const modes = new Map<string, PermissionModeDefinition>(
  BUILTIN_PERMISSION_MODES.map((mode) => [mode.id, mode]),
);

const onceOptions = [
  { optionId: "allow", name: "Allow once", kind: "allow_once" },
  { optionId: "reject", name: "Reject once", kind: "reject_once" },
];

const alwaysOnly = [
  { optionId: "allow-always", name: "Allow always", kind: "allow_always" },
  { optionId: "reject-always", name: "Reject always", kind: "reject_always" },
];

const standingPlusOnce = [
  ...onceOptions,
  { optionId: "allow-always", name: "Allow always", kind: "allow_always" },
];

function rule(partial: Partial<PermissionRule> & Pick<PermissionRule, "match">): PermissionRule {
  return {
    id: partial.id ?? "rule-1",
    sessionId: partial.sessionId ?? "s1",
    match: partial.match,
    decision: "allow",
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("permission engine", () => {
  const cases: Array<{
    name: string;
    modeId: string;
    kind?: string;
    source?: "agent" | "client-guard";
    options?: Array<{ optionId: string; name: string; kind: string }>;
    rules?: PermissionRule[];
    expectType: "auto" | "prompt";
    by?: "rule" | "mode";
    offerRemember?: boolean;
  }> = [
    {
      name: "always-ask edit prompts",
      modeId: "always-ask",
      kind: "edit",
      expectType: "prompt",
      offerRemember: false,
    },
    {
      name: "always-ask read prompts",
      modeId: "always-ask",
      kind: "read",
      expectType: "prompt",
      offerRemember: false,
    },
    {
      name: "ask-with-rules offers remember",
      modeId: "ask-with-rules",
      kind: "edit",
      expectType: "prompt",
      offerRemember: true,
    },
    {
      name: "ask-with-rules matches rule",
      modeId: "ask-with-rules",
      kind: "edit",
      rules: [rule({ match: { kind: "edit" } })],
      expectType: "auto",
      by: "rule",
    },
    {
      name: "auto-approve-reads allows read",
      modeId: "auto-approve-reads",
      kind: "read",
      expectType: "auto",
      by: "mode",
    },
    {
      name: "auto-approve-reads allows search",
      modeId: "auto-approve-reads",
      kind: "search",
      expectType: "auto",
      by: "mode",
    },
    {
      name: "auto-approve-reads prompts edit",
      modeId: "auto-approve-reads",
      kind: "edit",
      expectType: "prompt",
      offerRemember: false,
    },
    {
      name: "auto-approve-reads prompts missing kind",
      modeId: "auto-approve-reads",
      expectType: "prompt",
      offerRemember: false,
    },
    {
      name: "client-guard never remembers",
      modeId: "ask-with-rules",
      kind: "edit",
      source: "client-guard",
      expectType: "prompt",
      offerRemember: false,
    },
    {
      name: "rule does not apply without allow_once",
      modeId: "ask-with-rules",
      kind: "edit",
      options: alwaysOnly,
      rules: [rule({ match: { kind: "edit" } })],
      expectType: "prompt",
      offerRemember: false,
    },
  ];

  for (const row of cases) {
    it(row.name, () => {
      const request = {
        options: row.options ?? onceOptions,
        source: row.source ?? "agent",
        ...(row.kind !== undefined ? { kind: row.kind } : {}),
      };
      const decision = decidePermission({
        request,
        modeId: row.modeId,
        rules: row.rules ?? [],
        modes,
        sessionId: "s1",
        cwd: "/tmp/project",
      });
      expect(decision.type).toBe(row.expectType);
      if (decision.type === "auto") {
        expect(decision.by).toBe(row.by);
        expect(decision.optionId).toBe("allow");
      } else {
        expect(decision.offerRemember).toBe(row.offerRemember);
        expect(
          decision.options.every((o) => o.kind === "allow_once" || o.kind === "reject_once"),
        ).toBe(true);
      }
    });
  }

  it("drops standing options from prompt results even when present on the request", () => {
    const decision = decidePermission({
      request: {
        kind: "edit",
        options: standingPlusOnce,
        source: "agent",
      },
      modeId: "always-ask",
      rules: [],
      modes,
      sessionId: "s1",
      cwd: "/tmp",
    });
    expect(decision.type).toBe("prompt");
    if (decision.type === "prompt") {
      expect(decision.options.map((o) => o.optionId).sort()).toEqual(["allow", "reject"]);
    }
  });

  it("withRememberOption appends the synthetic choice only when offered", () => {
    expect(withRememberOption(onceOptions, false)).toEqual(onceOptions);
    const withRemember = withRememberOption(onceOptions, true);
    expect(withRemember.some((o) => o.optionId === STER_REMEMBER_OPTION_ID)).toBe(true);
  });

  it("toolName-scoped rules do not match a different tool", () => {
    const decision = decidePermission({
      request: {
        kind: "edit",
        toolName: "Write",
        options: onceOptions,
        source: "agent",
      },
      modeId: "ask-with-rules",
      rules: [rule({ match: { kind: "edit", toolName: "Edit" } })],
      modes,
      sessionId: "s1",
      cwd: "/tmp",
    });
    expect(decision.type).toBe("prompt");
  });
});
