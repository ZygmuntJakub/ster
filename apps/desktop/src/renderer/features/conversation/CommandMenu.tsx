import type { JSX } from "react";
import { useTranslation } from "react-i18next";

export interface AvailableCommandView {
  name: string;
  description: string;
  inputHint?: string;
}

export interface CommandMenuProps {
  commands: AvailableCommandView[];
  query: string;
  open: boolean;
  onPick: (command: AvailableCommandView) => void;
}

/**
 * Slash-command picker shown when the composer text starts with `/`.
 */
export function CommandMenu({
  commands,
  query,
  open,
  onPick,
}: CommandMenuProps): JSX.Element | null {
  const { t } = useTranslation();
  if (!open || commands.length === 0) {
    return null;
  }

  const needle = query.replace(/^\//, "").toLowerCase();
  const filtered = commands.filter(
    (command) =>
      needle.length === 0 ||
      command.name.toLowerCase().startsWith(needle) ||
      command.description.toLowerCase().includes(needle),
  );

  if (filtered.length === 0) {
    return (
      <div
        className="absolute bottom-full left-0 right-0 mb-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--panel)] p-2 text-xs text-[var(--ink2)] shadow-sm"
        data-testid="command-menu"
        role="listbox"
        aria-label={t("composer.commands")}
      >
        {t("composer.noCommands")}
      </div>
    );
  }

  return (
    <ul
      className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-auto rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--panel)] py-1 text-sm shadow-sm"
      data-testid="command-menu"
      role="listbox"
      aria-label={t("composer.commands")}
    >
      {filtered.map((command) => (
        <li key={command.name} role="option">
          <button
            type="button"
            className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left hover:bg-[var(--surface)]"
            data-testid={`command-${command.name}`}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(command);
            }}
          >
            <span className="font-medium text-[var(--ink)]">/{command.name}</span>
            <span className="text-xs text-[var(--ink2)]">{command.description}</span>
            {command.inputHint ? <span className="faint text-xs">{command.inputHint}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
