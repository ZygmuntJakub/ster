import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { ApprovalPrompt } from "../../features/approvals/ApprovalPrompt.js";
import { Composer } from "../../features/conversation/Composer.js";
import { ConversationView } from "../../features/conversation/ConversationView.js";
import { LoginPanel, type AuthMethodView } from "../../features/sessions/LoginPanel.js";
import { SessionStatus } from "../../features/sessions/SessionStatus.js";
import {
  appendItem,
  getItems,
  getPendingApproval,
  getSelectedSessionId,
  getSessions,
  patchItem,
  removeSession,
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

  useEffect(
    () =>
      subscribeSessions(() => {
        setTick((n) => n + 1);
      }),
    [],
  );

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
    if (session?.status === "needs-login") {
      void window.ster.sessions.authMethods({ sessionId }).then((methods) => {
        setAuthMethods(methods as AuthMethodView[]);
      });
    } else {
      setAuthMethods([]);
    }
  }, [sessionId, session?.status]);

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
      };

      if (
        (typed.type === "session.created" ||
          typed.type === "session.status" ||
          typed.type === "session.updated") &&
        typed.session
      ) {
        upsertSession(typed.session);
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

  return (
    <section className="conv col" aria-label={t("conversation.title")}>
      <header className="chead">
        <h1 className="title" data-testid="session-title">
          {session.title}
        </h1>
        <p className="muted text-sm">{session.status}</p>
      </header>
      <SessionStatus
        status={session.status}
        onRestart={() => {
          void window.ster.sessions.restart({ sessionId }).then((next) => {
            upsertSession(next as SessionCard);
          });
        }}
      />
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
      <div className="msgs grow scroll px-3 py-2">
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
        disabled={needsLogin || failed || session.status === "ended"}
        working={working}
      />
    </section>
  );
}
