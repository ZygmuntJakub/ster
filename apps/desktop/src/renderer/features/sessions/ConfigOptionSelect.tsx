import type { JSX } from "react";
import { useTranslation } from "react-i18next";

export interface ConfigOptionView {
  id: string;
  name: string;
  category?: string;
  type: "select" | "boolean";
  currentValue: string | boolean;
  choices?: Array<{ value: string; name: string }>;
}

export interface ConfigOptionSelectProps {
  sessionId: string;
  options: ConfigOptionView[];
  disabled?: boolean;
  onChanged?: (options: ConfigOptionView[]) => void;
}

const UI_CATEGORIES = new Set(["mode", "model", "thought_level"]);

/**
 * Mode / model / thought_level selectors — only for categories the agent offers.
 */
export function ConfigOptionSelect({
  sessionId,
  options,
  disabled,
  onChanged,
}: ConfigOptionSelectProps): JSX.Element | null {
  const { t } = useTranslation();
  const visible = options.filter(
    (option) =>
      option.type === "select" &&
      (option.category === undefined || UI_CATEGORIES.has(option.category)),
  );

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="config-options">
      {visible.map((option) => {
        const labelKey =
          option.category === "mode"
            ? "config.modeLabel"
            : option.category === "model"
              ? "config.modelLabel"
              : option.category === "thought_level"
                ? "config.thoughtLabel"
                : null;
        const label = labelKey ? t(labelKey) : option.name;
        const value =
          typeof option.currentValue === "string"
            ? option.currentValue
            : String(option.currentValue);
        return (
          <label
            key={option.id}
            className="f inline-flex items-center gap-2 text-xs"
            data-testid={`config-option-${option.id}`}
            data-category={option.category ?? ""}
          >
            <span className="lbl mb-0">{label}</span>
            <select
              value={value}
              disabled={disabled}
              aria-label={label}
              onChange={(event) => {
                const nextValue = event.target.value;
                void window.ster.sessions
                  .setConfigOption({ sessionId, configId: option.id, value: nextValue })
                  .then((full) => {
                    const record = full as { configOptions?: ConfigOptionView[] };
                    if (Array.isArray(record.configOptions)) {
                      onChanged?.(record.configOptions);
                    } else {
                      onChanged?.(
                        options.map((entry) =>
                          entry.id === option.id ? { ...entry, currentValue: nextValue } : entry,
                        ),
                      );
                    }
                  });
              }}
            >
              {(option.choices ?? []).map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.name}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}
