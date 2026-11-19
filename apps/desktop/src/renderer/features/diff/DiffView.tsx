import { diffLines } from "diff";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";

export interface DiffViewProps {
  path: string;
  oldText: string;
  newText: string;
}

/**
 * Simple line diff using the `diff` package (research.md R17).
 */
export function DiffView({ path, oldText, newText }: DiffViewProps): JSX.Element {
  const { t } = useTranslation();
  const parts = diffLines(oldText, newText);

  return (
    <div
      className="diff-view overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]"
      data-testid="diff-view"
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-2)] px-2 py-1">
        <p className="truncate font-mono text-xs text-[var(--ink)]">{path}</p>
        <span className="lbl">{t("diff.label")}</span>
      </div>
      <pre className="max-h-64 overflow-auto bg-[var(--code-bg)] p-2 font-mono text-xs leading-5">
        {parts.map((part, index) => {
          const className = part.added
            ? "block bg-[var(--add-bg)] text-[var(--ok)]"
            : part.removed
              ? "block bg-[var(--del-bg)] text-[var(--bad)]"
              : "block text-[var(--ink2)]";
          const prefix = part.added ? "+" : part.removed ? "-" : " ";
          return (
            <span key={String(index)} className={className}>
              {part.value
                .replace(/\n$/, "")
                .split("\n")
                .map((line, lineIndex) => (
                  <span key={`${String(index)}-${String(lineIndex)}`} className="block">
                    {prefix}
                    {line}
                  </span>
                ))}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
