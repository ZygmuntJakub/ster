import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import type { ConversationItemView, SessionCard } from "../../app/stores/sessions.js";
import { ConversationView } from "../conversation/ConversationView.js";

export interface HistoryViewProps {
  session: SessionCard;
  items: ConversationItemView[];
  onContinue: () => void;
  onNewInFolder: () => void;
  continuing?: boolean;
}

/**
 * Read-only history for ended sessions, with continue / new-in-folder actions.
 */
export function HistoryView({
  session,
  items,
  onContinue,
  onNewInFolder,
  continuing = false,
}: HistoryViewProps): JSX.Element {
  const { t } = useTranslation();
  const resumable = session.resumable === true;
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteSession = (runRecords: "delete" | "keep-without-text"): void => {
    setDeleting(true);
    void window.ster.sessions
      .delete({
        sessionId: session.id,
        runRecords,
      })
      .finally(() => {
        setDeleting(false);
        setDeletePrompt(false);
      });
  };

  return (
    <div className="flex h-full flex-col" data-testid="history-view">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <p className="text-sm text-[var(--ink2)]">{t("history.readOnly")}</p>
        {resumable ? (
          <button
            type="button"
            className="btn primary text-xs"
            data-testid="history-continue"
            disabled={continuing}
            onClick={onContinue}
          >
            {t("history.continue")}
          </button>
        ) : (
          <p className="text-xs text-[var(--ink2)]" data-testid="history-not-resumable">
            {t("history.notResumable")}
          </p>
        )}
        <button
          type="button"
          className="btn text-xs"
          data-testid="history-new-in-folder"
          onClick={onNewInFolder}
        >
          {t("history.newInFolder")}
        </button>
        <button
          type="button"
          className="btn danger text-xs"
          data-testid="history-delete"
          disabled={deleting}
          onClick={() => {
            setDeletePrompt(true);
          }}
        >
          {t("history.delete")}
        </button>
      </div>
      {deletePrompt ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
          data-testid="history-delete-prompt"
          role="group"
          aria-label={t("history.deletePrompt")}
        >
          <p className="grow text-[var(--ink2)]">{t("history.deletePrompt")}</p>
          <button
            type="button"
            className="btn danger text-xs"
            data-testid="history-delete-runs"
            disabled={deleting}
            onClick={() => {
              deleteSession("delete");
            }}
          >
            {t("history.deleteWithRuns")}
          </button>
          <button
            type="button"
            className="btn text-xs"
            data-testid="history-keep-runs"
            disabled={deleting}
            onClick={() => {
              deleteSession("keep-without-text");
            }}
          >
            {t("history.keepRuns")}
          </button>
          <button
            type="button"
            className="btn ghost text-xs"
            data-testid="history-delete-cancel"
            disabled={deleting}
            onClick={() => {
              setDeletePrompt(false);
            }}
          >
            {t("history.deleteCancel")}
          </button>
        </div>
      ) : null}
      <div className="msgs grow scroll px-3 py-2">
        <ConversationView sessionId={session.id} items={items} />
      </div>
    </div>
  );
}
