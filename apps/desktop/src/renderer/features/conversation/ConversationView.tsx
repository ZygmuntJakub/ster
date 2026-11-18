import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { ConversationItemView } from "../../app/stores/sessions.js";
import { ActionCard, type ActionPayload } from "../actions/ActionCard.js";
import { PlanView, type PlanEntryView } from "../plan/PlanView.js";
import { Markdown } from "./Markdown.js";

export interface ConversationViewProps {
  sessionId: string;
  items: ConversationItemView[];
}

function payloadText(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const record = payload as Record<string, unknown>;
  if (typeof record["text"] === "string") {
    return record["text"];
  }
  if (typeof record["notice"] === "string") {
    return record["notice"];
  }
  return JSON.stringify(payload);
}

function noticeLabel(payload: unknown, t: (key: string) => string): string {
  if (!payload || typeof payload !== "object") {
    return payloadText(payload);
  }
  const notice = (payload as { notice?: string }).notice;
  if (notice === "approval-by-rule") {
    return t("permission.noticeByRule");
  }
  if (notice === "approval-by-mode") {
    return t("permission.noticeByMode");
  }
  if (notice === "rule-created") {
    return t("permission.noticeRuleCreated");
  }
  return payloadText(payload);
}

function asAction(payload: unknown): ActionPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record["toolCallId"] !== "string" || typeof record["title"] !== "string") {
    return null;
  }
  return {
    toolCallId: record["toolCallId"],
    title: record["title"],
    kind: typeof record["kind"] === "string" ? record["kind"] : "other",
    status: typeof record["status"] === "string" ? record["status"] : "pending",
    locations: Array.isArray(record["locations"])
      ? (record["locations"] as ActionPayload["locations"])
      : [],
    content: Array.isArray(record["content"])
      ? (record["content"] as ActionPayload["content"])
      : [],
    ...(typeof record["toolName"] === "string" ? { toolName: record["toolName"] } : {}),
  };
}

function asPlanEntries(payload: unknown): PlanEntryView[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const entries = (payload as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.filter(
    (entry): entry is PlanEntryView =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as PlanEntryView).content === "string",
  );
}

/**
 * Conversation transcript: messages, thoughts, actions, plans, notices.
 */
export function ConversationView({ sessionId, items }: ConversationViewProps): JSX.Element {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--ink2)]">
        <p>{t("conversation.emptySession")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        if (item.kind === "user-message") {
          return (
            <article
              key={item.seq}
              className="msg user ml-8 rounded-[var(--r-md)] bg-[var(--surface-2)] px-3 py-2"
            >
              <p className="lbl">{t("conversation.you")}</p>
              <Markdown text={payloadText(item.payload)} sessionId={sessionId} itemSeq={item.seq} />
            </article>
          );
        }
        if (item.kind === "agent-message") {
          return (
            <article
              key={item.seq}
              className="msg agent mr-8 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
            >
              <p className="lbl">{t("conversation.agent")}</p>
              <Markdown text={payloadText(item.payload)} sessionId={sessionId} itemSeq={item.seq} />
            </article>
          );
        }
        if (item.kind === "agent-thought") {
          return (
            <article
              key={item.seq}
              className="msg thought mr-8 border-l-2 border-[var(--line-strong)] pl-3 text-sm italic text-[var(--ink2)]"
            >
              <p className="lbl not-italic">{t("conversation.thought")}</p>
              <p>{payloadText(item.payload)}</p>
            </article>
          );
        }
        if (item.kind === "action") {
          const action = asAction(item.payload);
          if (!action) {
            return null;
          }
          return (
            <ActionCard key={item.seq} sessionId={sessionId} itemSeq={item.seq} action={action} />
          );
        }
        if (item.kind === "plan") {
          return <PlanView key={item.seq} entries={asPlanEntries(item.payload)} />;
        }
        if (item.kind === "notice") {
          return (
            <article
              key={item.seq}
              className="msg notice rounded-[var(--r-md)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink2)]"
              data-testid="permission-notice"
            >
              <p className="lbl">{t("conversation.notice")}</p>
              <p>{noticeLabel(item.payload, t)}</p>
            </article>
          );
        }
        if (item.kind === "approval") {
          return (
            <article
              key={item.seq}
              className="msg notice rounded-[var(--r-md)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink2)]"
            >
              <p className="lbl">{t("conversation.notice")}</p>
              <p>{payloadText(item.payload)}</p>
            </article>
          );
        }
        return (
          <article
            key={item.seq}
            className="msg unknown rounded-[var(--r-md)] border border-dashed border-[var(--line)] px-3 py-2 text-sm text-[var(--ink2)]"
          >
            <p className="lbl">{t("conversation.unknown")}</p>
            <p>{t("conversation.unknownHint", { kind: item.kind })}</p>
          </article>
        );
      })}
    </div>
  );
}
