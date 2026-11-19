import type { PermissionModeDefinition, PermissionRequestView } from "../extensions/index.js";

const READ_KINDS = new Set(["read", "search"]);

function findAllowOnce(req: PermissionRequestView): string | undefined {
  return req.options.find((option) => option.kind === "allow_once")?.optionId;
}

export const ALWAYS_ASK_MODE_ID = "always-ask";
export const ASK_WITH_RULES_MODE_ID = "ask-with-rules";
export const AUTO_APPROVE_READS_MODE_ID = "auto-approve-reads";

export const ALWAYS_ASK_MODE: PermissionModeDefinition = {
  id: ALWAYS_ASK_MODE_ID,
  labelKey: "permission.mode.alwaysAsk",
  decide: () => "prompt",
};

export const ASK_WITH_RULES_MODE: PermissionModeDefinition = {
  id: ASK_WITH_RULES_MODE_ID,
  labelKey: "permission.mode.askWithRules",
  decide: () => "prompt",
};

export const AUTO_APPROVE_READS_MODE: PermissionModeDefinition = {
  id: AUTO_APPROVE_READS_MODE_ID,
  labelKey: "permission.mode.autoApproveReads",
  decide(req) {
    if (req.kind && READ_KINDS.has(req.kind)) {
      const allowOnce = findAllowOnce(req);
      if (allowOnce) {
        return { select: allowOnce };
      }
    }
    return "prompt";
  },
};

/** Built-in modes from research.md R13 / FR-012. */
export const BUILTIN_PERMISSION_MODES: PermissionModeDefinition[] = [
  ALWAYS_ASK_MODE,
  ASK_WITH_RULES_MODE,
  AUTO_APPROVE_READS_MODE,
];

export function isBuiltinPermissionMode(modeId: string): boolean {
  return BUILTIN_PERMISSION_MODES.some((mode) => mode.id === modeId);
}

/**
 * Restrict available permission modes to an organization allow-list (US10).
 * Absent allow-list → all modes. Unknown ids in the allow-list are ignored.
 */
export function filterPermissionModes(
  modes: ReadonlyArray<PermissionModeDefinition>,
  allowedIds: readonly string[] | null | undefined,
): PermissionModeDefinition[] {
  if (allowedIds === null || allowedIds === undefined) {
    return [...modes];
  }
  const allowed = new Set(allowedIds);
  return modes.filter((mode) => allowed.has(mode.id));
}
