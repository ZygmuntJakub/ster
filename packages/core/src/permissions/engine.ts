import type { PermissionModeDefinition, PermissionRequestView } from "../extensions/index.js";
import type { ApprovalOption } from "../model/events.js";
import { ASK_WITH_RULES_MODE_ID, BUILTIN_PERMISSION_MODES } from "./modes.js";
import { findMatchingRule, type PermissionRule } from "./rules.js";

/** Synthetic option id for the application's remember choice (never sent to the agent). */
export const STER_REMEMBER_OPTION_ID = "ster.remember";

export type EngineDecision =
  | { type: "auto"; optionId: string; by: "rule" | "mode"; ruleId?: string }
  | { type: "prompt"; options: ApprovalOption[]; offerRemember: boolean };

function oneTimeOptions(
  options: ReadonlyArray<{ optionId: string; name: string; kind: string }>,
): ApprovalOption[] {
  return options
    .filter((option) => option.kind === "allow_once" || option.kind === "reject_once")
    .map((option) => ({
      optionId: option.optionId,
      name: option.name,
      kind: option.kind,
    }));
}

function findAllowOnce(options: ReadonlyArray<ApprovalOption>): string | undefined {
  return options.find((option) => option.kind === "allow_once")?.optionId;
}

function resolveMode(
  modeId: string,
  modes: ReadonlyMap<string, PermissionModeDefinition>,
): PermissionModeDefinition | undefined {
  return modes.get(modeId) ?? BUILTIN_PERMISSION_MODES.find((mode) => mode.id === modeId);
}

/**
 * Pure permission decision (research.md R13).
 * Never returns standing-permission kinds; remember is only offered in ask-with-rules.
 */
export function decidePermission(input: {
  request: PermissionRequestView;
  modeId: string;
  rules: ReadonlyArray<PermissionRule>;
  modes: ReadonlyMap<string, PermissionModeDefinition>;
  sessionId: string;
  cwd: string;
}): EngineDecision {
  const options = oneTimeOptions(input.request.options);

  if (input.request.source === "client-guard") {
    return { type: "prompt", options, offerRemember: false };
  }

  const allowOnce = findAllowOnce(options);
  if (allowOnce && input.request.kind) {
    const matchInput =
      input.request.toolName !== undefined
        ? { kind: input.request.kind, toolName: input.request.toolName }
        : { kind: input.request.kind };
    const matched = findMatchingRule(input.rules, matchInput);
    if (matched) {
      return {
        type: "auto",
        optionId: allowOnce,
        by: "rule",
        ruleId: matched.id,
      };
    }
  }

  const mode = resolveMode(input.modeId, input.modes);
  if (mode) {
    const decision = mode.decide(input.request, {
      sessionId: input.sessionId,
      cwd: input.cwd,
      modeId: input.modeId,
    });
    if (decision !== "prompt") {
      const selected = options.find((option) => option.optionId === decision.select);
      if (selected && selected.kind === "allow_once") {
        return { type: "auto", optionId: selected.optionId, by: "mode" };
      }
    }
  }

  return {
    type: "prompt",
    options,
    offerRemember: input.modeId === ASK_WITH_RULES_MODE_ID && allowOnce !== undefined,
  };
}

export function withRememberOption(
  options: ReadonlyArray<ApprovalOption>,
  offerRemember: boolean,
  rememberLabel = "Allow and remember for this session",
): ApprovalOption[] {
  if (!offerRemember) {
    return [...options];
  }
  return [
    ...options,
    {
      optionId: STER_REMEMBER_OPTION_ID,
      name: rememberLabel,
      kind: "allow_once",
    },
  ];
}
