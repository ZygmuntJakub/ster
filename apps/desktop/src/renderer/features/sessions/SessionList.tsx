import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import {
  getSelectedSessionId,
  getSessions,
  selectSession,
  setSessions,
  subscribeSessions,
  upsertSession,
  type SessionCard,
} from "../../app/stores/sessions.js";
import { NewSessionDialog } from "./NewSessionDialog.js";

function statusTone(status: string): string {
  if (status === "working" || status === "starting") {
    return "working";
  }
  if (status === "waiting-approval" || status === "needs-login") {
    return "waiting";
  }
  if (status === "failed") {
    return "failed";
  }
  return "finished";
}

/**
 * Session board list: status tallies and cards with attention signals.
 */
export function SessionList(): JSX.Element {
  const { t } = useTranslation();
  const [, setTick] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(
    () =>
      subscribeSessions(() => {
        setTick((n) => n + 1);
      }),
    [],
  );

  useEffect(() => {
    void window.ster.sessions.list().then((list) => {
      setSessions(list as SessionCard[]);
    });
  }, []);

  const sessions = getSessions();
  const selected = getSelectedSessionId();
  const counts = {
    working: sessions.filter((s) => s.status === "working" || s.status === "starting").length,
    waiting: sessions.filter((s) => s.status === "waiting-approval" || s.status === "needs-login")
      .length,
    finished: sessions.filter((s) => s.status === "idle" || s.status === "ended").length,
    failed: sessions.filter((s) => s.status === "failed").length,
  };

  return (
    <aside className="board-C col" aria-label={t("board.title")}>
      <div className="tally" aria-hidden="true">
        <div>
          <b>{counts.working}</b>
          {t("board.working")}
        </div>
        <div>
          <b>{counts.waiting}</b>
          {t("board.waiting")}
        </div>
        <div>
          <b>{counts.finished}</b>
          {t("board.finished")}
        </div>
        <div>
          <b>{counts.failed}</b>
          {t("board.failed")}
        </div>
      </div>
      <div className="scroll grow flex flex-col gap-2 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="lbl">{t("board.title")}</p>
            <p className="faint text-xs" data-testid="session-count">
              {t("board.sessionCount", { count: sessions.length })}
            </p>
          </div>
          <button
            type="button"
            className="btn primary text-xs"
            data-testid="new-session"
            onClick={() => {
              setDialogOpen(true);
            }}
          >
            {t("session.new")}
          </button>
        </div>
        {sessions.length === 0 ? (
          <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-4 text-sm text-[var(--ink2)]">
            <p className="font-medium text-[var(--ink)]">{t("board.empty")}</p>
            <p className="mt-1">{t("board.emptyHint")}</p>
          </div>
        ) : (
          sessions.map((session) => {
            const attention =
              session.needsAttention === true ||
              session.status === "waiting-approval" ||
              session.status === "needs-login";
            return (
              <button
                key={session.id}
                type="button"
                data-testid={`session-card-${session.id}`}
                data-attention={attention ? "true" : "false"}
                className={`rounded-[var(--r-md)] border px-3 py-2 text-left text-sm ${
                  selected === session.id
                    ? "border-[var(--ink)] bg-[var(--surface)]"
                    : "border-[var(--line)] bg-[var(--surface)]"
                }`}
                onClick={() => {
                  selectSession(session.id);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--ink)]">{session.title}</span>
                  <span className={`chip ${statusTone(session.status)}`}>{session.status}</span>
                </div>
                <p className="mt-1 truncate text-xs text-[var(--ink2)]">{session.cwd}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ink2)]">
                  <span>{session.agentId}</span>
                  {session.agentVersion ? <span>v{session.agentVersion}</span> : null}
                  <span>{new Date(session.lastActivityAt).toLocaleString()}</span>
                  {attention ? (
                    <span className="chip waiting" data-testid={`attention-${session.id}`}>
                      {t("board.attention")}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })
        )}
      </div>
      <NewSessionDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
        }}
        onCreated={(sessionId) => {
          void window.ster.sessions.get({ sessionId }).then((session) => {
            upsertSession(session as SessionCard);
            selectSession(sessionId);
          });
        }}
      />
    </aside>
  );
}
