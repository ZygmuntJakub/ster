import { describe, expect, it } from "vitest";
import {
  LEGACY_MODE_OPTION_ID,
  applyCurrentModeUpdate,
  commandPromptText,
  configOptionFromModes,
  initialConfigOptions,
  normalizeAvailableCommands,
  normalizeConfigOptions,
} from "../../src/sessions/config-options.js";

describe("config-options helpers", () => {
  it("maps legacy modes to one select option", () => {
    const option = configOptionFromModes({
      currentModeId: "code",
      availableModes: [
        { id: "code", name: "Code" },
        { id: "ask", name: "Ask", description: "Q&A" },
      ],
    });
    expect(option.id).toBe(LEGACY_MODE_OPTION_ID);
    expect(option.category).toBe("mode");
    expect(option.legacyMode).toBe(true);
    expect(option.currentValue).toBe("code");
    expect(option.choices).toEqual([
      { value: "code", name: "Code" },
      { value: "ask", name: "Ask", description: "Q&A" },
    ]);
  });

  it("prefers configOptions and skips legacy mode when a mode category exists", () => {
    const options = initialConfigOptions({
      configOptions: [
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          type: "select",
          currentValue: "ask",
          options: [{ value: "ask", name: "Ask" }],
        },
      ],
      modes: {
        currentModeId: "code",
        availableModes: [{ id: "code", name: "Code" }],
      },
    });
    expect(options).toHaveLength(1);
    expect(options[0]?.legacyMode).toBeUndefined();
    expect(options[0]?.currentValue).toBe("ask");
  });

  it("adds legacy mode when configOptions lack a mode category", () => {
    const options = initialConfigOptions({
      configOptions: [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "small",
          options: [{ value: "small", name: "Small" }],
        },
      ],
      modes: {
        currentModeId: "code",
        availableModes: [{ id: "code", name: "Code" }],
      },
    });
    expect(options.map((o) => o.id)).toEqual(["model", "mode"]);
    expect(options[1]?.legacyMode).toBe(true);
  });

  it("applies current_mode_update and normalizes commands", () => {
    const updated = applyCurrentModeUpdate(
      normalizeConfigOptions([
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          type: "select",
          currentValue: "code",
          options: [
            { value: "code", name: "Code" },
            { value: "ask", name: "Ask" },
          ],
        },
      ]),
      "ask",
    );
    expect(updated[0]?.currentValue).toBe("ask");

    const commands = normalizeAvailableCommands([
      { name: "status", description: "Show status" },
      { name: "reset", description: "Reset", input: { hint: "note" } },
      { bad: true },
    ]);
    expect(commands).toEqual([
      { name: "status", description: "Show status" },
      { name: "reset", description: "Reset", inputHint: "note" },
    ]);
    expect(commandPromptText("status")).toBe("/status");
    expect(commandPromptText("reset", " now ")).toBe("/reset now");
  });
});
