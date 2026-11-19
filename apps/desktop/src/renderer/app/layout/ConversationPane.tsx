import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { ApprovalPrompt } from "../../features/approvals/ApprovalPrompt.js";
import { PermissionModeSelect } from "../../features/approvals/PermissionModeSelect.js";
import { RulesPanel } from "../../features/approvals/RulesPanel.js";
import { Composer } from "../../features/conversation/Composer.js";
import type { AvailableCommandView } from "../../features/conversation/CommandMenu.js";
import { ConversationView } from "../../features/conversation/ConversationView.js";
import {
  ConfigOptionSelect,
  type ConfigOptionView,
} from "../../features/sessions/ConfigOptionSelect.js";
import { HistoryView } from "../../features/sessions/HistoryView.js";
import { LoginPanel, type AuthMethodView } from "../../features/sessions/LoginPanel.js";
import { NewSessionDialog } from "../../features/sessions/NewSessionDialog.js";
import { SessionStatus } from "../../features/sessions/SessionStatus.js";
import {
  appendCommandOutput,
  markCommandExited,
  upsertCommandStarted,
} from "../stores/commands.js";
import {
  appendItem,
  getItems,
  getPendingApproval,
  getSelectedSessionId,
  getSessions,
  loadOlderItems,
  patchItem,
  removeSession,
  selectSession,
  setItems,
  setPendingApproval,
  subscribeSessions,
  upsertSession,
  type ApprovalView,
  type ConversationItemView,
  type SessionCard,
} from "../stores/sessions.js";

/**
 * Main conversation area beside the session board.
 */
export function ConversationPane(): JSX.Element {
  const { t } = useTranslation();
  const [, setTick] = useState(0);
  const [authMethods, setAuthMethods] = useState<AuthMethodView[]>([]);
  const [permissionMode, setPermissionMode] = useState("always-ask");
  const [configOptions, setConfigOptions] = useState<ConfigOptionView[]>([]);
  const [availableCommands, setAvailableCommands] = useState<AvailableCommandView[]>([]);
  const [canAttach, setCanAttach] = useState(false);
  const [rulesRefresh, setRulesRefresh] = useState(0);
  const [continuing, setContinuing] = useState(false);
  const [newInFolderOpen, setNewInFolderOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(
    () =>
      subscribeSessions(() => {
        setTick((n) => n + 1);
      }),
    [],
  );

  useEffect(() => {
    const onSeed = (event: Event): void => {
      const detail = (event as CustomEvent).detail as {
        sessionId?: string;
        items?: ConversationItemView[];
      };
      if (typeof detail.sessionId === "string" && Array.isArray(detail.items)) {
        setItems(detail.sessionId, detail.items);
      }
    };
    window.addEventListener("ster:test-seed-items", onSeed);
    return () => {
      window.removeEventListener("ster:test-seed-items", onSeed);
    };
  }, []);

  const sessionId = getSelectedSessionId();
  const session = getSessions().find((s) => s.id === sessionId) ?? null;
  const items = sessionId ? getItems(sessionId) : [];
  const approval = getPendingApproval();

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    void window.ster.sessions.items({ sessionId, limit: 100 }).then((list) => {
      setItems(sessionId, list as ConversationItemView[]);
    });
    void window.ster.sessions.get({ sessionId }).then((full) => {
      const record = full as SessionCard & {
        permissionMode?: string;
        configOptions?: ConfigOptionView[];
        availableCommands?: AvailableCommandView[];
        promptCapabilities?: { image?: boolean; embeddedContext?: boolean };
      };
      upsertSession(record);
      if (typeof record.permissionMode === "string") {
        setPermissionMode(record.permissionMode);
      }
      setConfigOptions(Array.isArray(record.configOptions) ? record.configOptions : []);
      setAvailableCommands(Array.isArray(record.availableCommands) ? record.availableCommands : []);
      const caps = record.promptCapabilities;
      setCanAttach(caps?.image === true || caps?.embeddedContext === true);
    });
    if (session?.status === "needs-login") {
      void window.ster.sessions.authMethods({ sessionId }).then((methods) => {
        setAuthMethods(methods as AuthMethodView[]);
      });
    } else {
      setAuthMethods([]);
    }
  }, [sessionId, session?.status]);

  useEffect(() => {
    if (!sessionId || items.length === 0) {
      return;
    }
    const first = items[0];
    if (first && first.seq > 1) {
      void loadOlderItems(sessionId, 20);
    }
  }, [sessionId, items.length]);

  useEffect(() => {
    return window.ster.events.subscribe((event) => {
      if (!event || typeof event !== "object" || !("type" in event)) {
        return;
      }
      const typed = event as {
        type: string;
        sessionId?: string;
        session?: SessionCard;
        item?: ConversationItemView;
        seq?: number;
        patch?: Record<string, unknown>;
        approval?: ApprovalView;
        approvalId?: string;
        commandRunId?: string;
        data?: string;
        command?: string;
        args?: string[];
        cwd?: string;
        truncated?: boolean;
        exit?: { code?: number | null; signal?: string | null };
        state?: "running" | "exited" | "killed" | "released";
      };

      if (
        (typed.type === "session.created" ||
          typed.type === "session.status" ||
          typed.type === "session.updated") &&
        typed.session
      ) {
        upsertSession(typed.session);
        if (typed.type === "session.updated" && typed.sessionId) {
          const id = typed.sessionId;
          void window.ster.sessions.get({ sessionId: id }).then((full) => {
            if (getSelectedSessionId() !== id) {
              return;
            }
            const record = full as SessionCard & {
              configOptions?: ConfigOptionView[];
              availableCommands?: AvailableCommandView[];
            };
            setConfigOptions(Array.isArray(record.configOptions) ? record.configOptions : []);
            setAvailableCommands(
              Array.isArray(record.availableCommands) ? record.availableCommands : [],
            );
          });
        }
      }
      if (typed.type === "session.deleted" && typed.sessionId) {
        removeSession(typed.sessionId);
      }
      if (typed.type === "item.appended" && typed.item) {
        appendItem(typed.item);
      }
      if (
        typed.type === "item.updated" &&
        typed.sessionId &&
        typed.seq !== undefined &&
        typed.patch
      ) {
        patchItem(typed.sessionId, typed.seq, typed.patch);
      }
      if (typed.type === "approval.requested" && typed.approval) {
        setPendingApproval(typed.approval);
      }
      if (typed.type === "approval.resolved") {
        setPendingApproval(null);
        setRulesRefresh((n) => n + 1);
      }
      if (typed.type === "item.appended" && typed.item?.kind === "notice") {
        setRulesRefresh((n) => n + 1);
      }
      if (typed.type === "command.started" && typed.sessionId && typed.commandRunId) {
        upsertCommandStarted({
          commandRunId: typed.commandRunId,
          sessionId: typed.sessionId,
          ...(typed.command !== undefined ? { command: typed.command } : {}),
          ...(typed.args !== undefined ? { args: typed.args } : {}),
          ...(typed.cwd !== undefined ? { cwd: typed.cwd } : {}),
        });
      }
      if (typed.type === "command.output" && typed.commandRunId && typed.data) {
        appendCommandOutput(typed.commandRunId, typed.data, typed.truncated);
      }
      if (typed.type === "command.exited" && typed.commandRunId) {
        markCommandExited(typed.commandRunId, typed.exit, typed.state);
      }
    });
  }, []);

  if (!session || !sessionId) {
    return (
      <section className="conv col" aria-label={t("conversation.title")}>
        <header className="chead">
          <h1 className="title">{t("app.name")}</h1>
          <p className="muted text-sm">{t("app.tagline")}</p>
        </header>
        <div className="msgs grow scroll">
          <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--ink2)]">
            <p>{t("conversation.empty")}</p>
            <p className="mt-1 faint">{t("conversation.placeholder")}</p>
          </div>
        </div>
      </section>
    );
  }

  const working = session.status === "working" || session.status === "waiting-approval";
  const needsLogin = session.status === "needs-login";
  const failed = session.status === "failed";
  const historyOnly = session.status === "ended";

  return (
    <section className="conv col" aria-label={t("conversation.title")}>
      <header className="chead flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 grow">
          {renaming ? (
            <form
              className="flex flex-wrap items-center gap-2"
              data-testid="session-rename-form"
              onSubmit={(event) => {
                event.preventDefault();
                const title = renameValue.trim();
                if (!title || renameBusy) {
                  return;
                }
                setRenameBusy(true);
                void window.ster.sessions
                  .rename({ sessionId, title })
                  .then(() => window.ster.sessions.get({ sessionId }))
                  .then((next) => {
                    upsertSession(next as SessionCard);
                    setRenaming(false);
                  })
                  .finally(() => {
                    setRenameBusy(false);
                  });
              }}
            >
              <input
                className="input"
                value={renameValue}
                data-testid="session-rename-input"
                aria-label={t("session.rename")}
                disabled={renameBusy}
                onChange={(event) => {
                  setRenameValue(event.target.value);
                }}
              />
              <button
                type="submit"
                className="btn primary text-xs"
                data-testid="session-rename-save"
                disabled={renameBusy || !renameValue.trim()}
              >
                {t("session.renameSave")}
              </button>
              <button
                type="button"
                className="btn ghost text-xs"
                data-testid="session-rename-cancel"
                disabled={renameBusy}
                onClick={() => {
                  setRenaming(false);
                }}
              >
                {t("session.renameCancel")}
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="title" data-testid="session-title" data-session-id={sessionId}>
                {session.title}
              </h1>
              <button
                type="button"
                className="btn ghost text-xs"
                data-testid="session-rename"
                onClick={() => {
                  setRenameValue(session.title);
                  setRenaming(true);
                }}
              >
                {t("session.rename")}
              </button>
            </div>
          )}
          <p className="muted text-sm">{session.status}</p>
        </div>
        {!historyOnly ? (
          <div className="flex flex-wrap items-center gap-3">
            <PermissionModeSelect
              sessionId={sessionId}
              mode={permissionMode}
              disabled={needsLogin || failed}
              onChanged={(mode) => {
                setPermissionMode(mode);
              }}
            />
            <ConfigOptionSelect
              sessionId={sessionId}
              options={configOptions}
              disabled={needsLogin || failed || working}
              onChanged={(next) => {
                setConfigOptions(next);
              }}
            />
          </div>
        ) : null}
      </header>
      {historyOnly ? (
        <>
          <HistoryView
            session={session}
            items={items}
            continuing={continuing}
            onContinue={() => {
              setContinuing(true);
              void window.ster.sessions
                .resume({ sessionId })
                .then((next) => {
                  upsertSession(next as SessionCard);
                })
                .finally(() => {
                  setContinuing(false);
                });
            }}
            onNewInFolder={() => {
              setNewInFolderOpen(true);
            }}
          />
          <NewSessionDialog
            open={newInFolderOpen}
            onClose={() => {
              setNewInFolderOpen(false);
            }}
            onCreated={(id) => {
              selectSession(id);
              void window.ster.sessions.get({ sessionId: id }).then((next) => {
                upsertSession(next as SessionCard);
              });
            }}
          />
        </>
      ) : (
        <>
          <SessionStatus
            status={session.status}
            onRestart={() => {
              void window.ster.sessions.restart({ sessionId }).then((next) => {
                upsertSession(next as SessionCard);
              });
            }}
          />
          <RulesPanel sessionId={sessionId} refreshKey={rulesRefresh} />
          {needsLogin ? (
            <LoginPanel
              sessionId={sessionId}
              methods={authMethods}
              onAuthenticated={() => {
                void window.ster.sessions.get({ sessionId }).then((next) => {
                  upsertSession(next as SessionCard);
                });
              }}
            />
          ) : null}
          <div className="msgs grow scroll flex min-h-0 flex-col px-3 py-2">
            <ConversationView sessionId={sessionId} items={items} />
          </div>
          {approval && approval.sessionId === sessionId ? (
            <ApprovalPrompt
              approval={approval}
              onResolved={() => {
                setPendingApproval(null);
              }}
            />
          ) : null}
          <Composer
            sessionId={sessionId}
            disabled={needsLogin || failed}
            working={working}
            canAttach={canAttach}
            commands={availableCommands}
          />
        </>
      )}
    </section>
  );
}
