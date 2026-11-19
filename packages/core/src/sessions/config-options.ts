/**
 * Session config options and slash commands (data-model.md, research.md R2).
 *
 * Prefer `configOptions` + `session/set_config_option`. Legacy `modes` +
 * `session/set_mode` map to a single select option with id `mode`.
 */

export type ConfigOptionCategory = string;

export interface ConfigOptionChoice {
  value: string;
  name: string;
  description?: string;
}

export interface ConfigOption {
  id: string;
  name: string;
  category?: ConfigOptionCategory;
  type: "select" | "boolean";
  currentValue: string | boolean;
  choices?: ConfigOptionChoice[];
  /** True when this option was synthesized from legacy `modes` (use set_mode). */
  legacyMode?: boolean;
}

export interface AvailableCommandInfo {
  name: string;
  description: string;
  inputHint?: string;
}

export interface SessionModeStateLike {
  currentModeId: string;
  availableModes: Array<{ id: string; name: string; description?: string | null }>;
}

/** Stable id used when mapping legacy `modes` to one config option. */
export const LEGACY_MODE_OPTION_ID = "mode";

/**
 * Map ACP `SessionModeState` to a single select config option (R2 fallback).
 */
export function configOptionFromModes(modes: SessionModeStateLike): ConfigOption {
  return {
    id: LEGACY_MODE_OPTION_ID,
    name: "Mode",
    category: "mode",
    type: "select",
    currentValue: modes.currentModeId,
    choices: modes.availableModes.map((mode) => {
      const choice: ConfigOptionChoice = { value: mode.id, name: mode.name };
      if (typeof mode.description === "string" && mode.description.length > 0) {
        choice.description = mode.description;
      }
      return choice;
    }),
    legacyMode: true,
  };
}

function flattenSelectChoices(options: unknown): ConfigOptionChoice[] {
  if (!Array.isArray(options)) {
    return [];
  }
  const choices: ConfigOptionChoice[] = [];
  for (const entry of options) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record["value"] === "string" && typeof record["name"] === "string") {
      const choice: ConfigOptionChoice = {
        value: record["value"],
        name: record["name"],
      };
      if (typeof record["description"] === "string") {
        choice.description = record["description"];
      }
      choices.push(choice);
      continue;
    }
    if (Array.isArray(record["options"])) {
      choices.push(...flattenSelectChoices(record["options"]));
    }
  }
  return choices;
}

/**
 * Normalize an ACP `SessionConfigOption` (or already-normalized option) into
 * the session model shape.
 */
export function normalizeConfigOption(raw: unknown): ConfigOption | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record["id"] !== "string" || typeof record["name"] !== "string") {
    return null;
  }
  const type = record["type"] === "boolean" ? "boolean" : "select";
  let currentValue: string | boolean;
  if (type === "boolean") {
    currentValue = record["currentValue"] === true;
  } else if (typeof record["currentValue"] === "string") {
    currentValue = record["currentValue"];
  } else if (
    typeof record["currentValue"] === "number" ||
    typeof record["currentValue"] === "boolean"
  ) {
    currentValue = String(record["currentValue"]);
  } else {
    currentValue = "";
  }
  const option: ConfigOption = {
    id: record["id"],
    name: record["name"],
    type,
    currentValue,
  };
  if (typeof record["category"] === "string") {
    option.category = record["category"];
  }
  if (type === "select") {
    option.choices = flattenSelectChoices(record["options"] ?? record["choices"]);
  }
  if (record["legacyMode"] === true) {
    option.legacyMode = true;
  }
  return option;
}

export function normalizeConfigOptions(raw: unknown): ConfigOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ConfigOption[] = [];
  for (const entry of raw) {
    const option = normalizeConfigOption(entry);
    if (option) {
      out.push(option);
    }
  }
  return out;
}

/**
 * Build the initial option list from `session/new` (or load) response fields.
 * When both `configOptions` and legacy `modes` are present, keep config options
 * and only add the legacy mode option if no `category: "mode"` option exists.
 */
export function initialConfigOptions(input: {
  configOptions?: unknown;
  modes?: SessionModeStateLike | null;
}): ConfigOption[] {
  const fromConfig = normalizeConfigOptions(input.configOptions);
  const hasModeCategory = fromConfig.some((option) => option.category === "mode");
  if (input.modes && !hasModeCategory) {
    return [...fromConfig, configOptionFromModes(input.modes)];
  }
  return fromConfig;
}

/**
 * Apply `current_mode_update` onto the option list (prefer category mode, else
 * legacy id `mode`).
 */
export function applyCurrentModeUpdate(
  options: ConfigOption[],
  currentModeId: string,
): ConfigOption[] {
  const index = options.findIndex(
    (option) => option.category === "mode" || option.id === LEGACY_MODE_OPTION_ID,
  );
  if (index === -1) {
    return [
      ...options,
      {
        id: LEGACY_MODE_OPTION_ID,
        name: "Mode",
        category: "mode",
        type: "select",
        currentValue: currentModeId,
        choices: [{ value: currentModeId, name: currentModeId }],
        legacyMode: true,
      },
    ];
  }
  return options.map((option, i) =>
    i === index ? { ...option, currentValue: currentModeId } : option,
  );
}

export function normalizeAvailableCommands(raw: unknown): AvailableCommandInfo[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: AvailableCommandInfo[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record["name"] !== "string" || typeof record["description"] !== "string") {
      continue;
    }
    const command: AvailableCommandInfo = {
      name: record["name"],
      description: record["description"],
    };
    const input = record["input"];
    if (input !== null && typeof input === "object" && "hint" in input) {
      const hint = (input as { hint?: unknown }).hint;
      if (typeof hint === "string") {
        command.inputHint = hint;
      }
    } else if (typeof record["inputHint"] === "string") {
      command.inputHint = record["inputHint"];
    }
    out.push(command);
  }
  return out;
}

/**
 * Prompt text for invoking a slash command (R2: invoked as prompt text).
 */
export function commandPromptText(name: string, input?: string): string {
  const trimmed = input?.trim();
  return trimmed ? `/${name} ${trimmed}` : `/${name}`;
}
