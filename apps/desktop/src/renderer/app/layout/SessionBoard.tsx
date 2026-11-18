import type { JSX } from "react";
import { useTranslation } from "react-i18next";

/**
 * Session board area: status tallies + empty list until US1 creates sessions.
 */
export function SessionBoard(): JSX.Element {
  const { t } = useTranslation();

  return (
    <aside className="board-C col" aria-label={t("board.title")}>
      <div className="tally" aria-hidden="true">
        <div>
          <b>0</b>
          {t("board.working")}
        </div>
        <div>
          <b>0</b>
          {t("board.waiting")}
        </div>
        <div>
          <b>0</b>
          {t("board.finished")}
        </div>
        <div>
          <b>0</b>
          {t("board.failed")}
        </div>
      </div>
      <div className="scroll grow flex flex-col gap-2 pt-2">
        <p className="lbl">{t("board.title")}</p>
        <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-4 text-sm text-[var(--ink2)]">
          <p className="font-medium text-[var(--ink)]">{t("board.empty")}</p>
          <p className="mt-1">{t("board.emptyHint")}</p>
        </div>
      </div>
    </aside>
  );
}
