import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { ConversationItemView } from "../../app/stores/sessions.js";
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

/**
 * Conversation transcript: messages, thoughts, notices, unknown placeholders.
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
        if (item.kind === "notice" || item.kind === "approval") {
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
