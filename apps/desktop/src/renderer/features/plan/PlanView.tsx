import type { JSX } from "react";
import { useTranslation } from "react-i18next";

export interface PlanEntryView {
  content: string;
  priority: string;
  status: string;
}

export interface PlanViewProps {
  entries: PlanEntryView[];
}

/**
 * Compact plan checklist; latest plan state replaces earlier.
 */
export function PlanView({ entries }: PlanViewProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <section
      className="plan-view rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
      data-testid="plan-view"
      aria-label={t("plan.label")}
    >
      <p className="lbl">{t("plan.label")}</p>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--ink2)]">{t("plan.empty")}</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-1">
          {entries.map((entry, index) => (
            <li
              key={`${entry.content}:${String(index)}`}
              className="flex items-start gap-2 text-sm"
              data-status={entry.status}
            >
              <span className={`chip ${entry.status}`}>{entry.status}</span>
              <span className="grow text-[var(--ink)]">{entry.content}</span>
              <span className="text-xs text-[var(--ink2)]">{entry.priority}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
